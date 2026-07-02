package io.kafbat.ui.emitter;

import io.kafbat.ui.model.ConsumerPosition;
import io.kafbat.ui.model.TopicMessageEventDTO;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Supplier;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.InterruptException;
import org.apache.kafka.common.utils.Bytes;
import reactor.core.publisher.FluxSink;

@Slf4j
abstract class RangePollingEmitter extends AbstractEmitter {

  private final Supplier<EnhancedConsumer> consumerSupplier;
  private final Cursor.Tracking cursor;
  protected final ConsumerPosition consumerPosition;
  protected final int messagesPerPage;

  private long scannedRecords = 0;
  private Instant pollingStartedAt;

  protected RangePollingEmitter(Supplier<EnhancedConsumer> consumerSupplier,
                                ConsumerPosition consumerPosition,
                                int messagesPerPage,
                                MessagesProcessing messagesProcessing,
                                PollingSettings pollingSettings,
                                Cursor.Tracking cursor) {
    super(messagesProcessing, pollingSettings);
    this.consumerPosition = consumerPosition;
    this.messagesPerPage = messagesPerPage;
    this.consumerSupplier = consumerSupplier;
    this.cursor = cursor;
  }

  protected record FromToOffset(/*inclusive*/ long from, /*exclusive*/ long to) {
  }

  //should return empty map if polling should be stopped
  protected abstract TreeMap<TopicPartition, FromToOffset> nextPollingRange(
      TreeMap<TopicPartition, FromToOffset> prevRange, //empty on start
      SeekOperations seekOperations
  );

  @Override
  public void accept(FluxSink<TopicMessageEventDTO> sink) {
    log.debug("Starting polling for {}", consumerPosition);
    pollingStartedAt = Instant.now();
    scannedRecords = 0;
    try (EnhancedConsumer consumer = consumerSupplier.get()) {
      sendPhase(sink, "Consumer created");
      var seekOperations = SeekOperations.create(consumer, consumerPosition);
      cursor.initOffsets(seekOperations.getOffsetsForSeek());

      TreeMap<TopicPartition, FromToOffset> pollRange = nextPollingRange(new TreeMap<>(), seekOperations);
      log.debug("Starting from offsets {}", pollRange);

      while (!sink.isCancelled() && !pollRange.isEmpty() && !isSendLimitReached() && !isScanBudgetExceeded()) {
        var polled = poll(consumer, sink, pollRange);
        send(sink, polled, cursor);
        pollRange = nextPollingRange(pollRange, seekOperations);
      }
      if (sink.isCancelled()) {
        log.debug("Polling finished due to sink cancellation");
      }
      // cursor is passed (non-null) if the requested range was not fully scanned,
      // so the client can continue polling from the last scanned offsets
      sendFinishStatsAndCompleteSink(sink, pollRange.isEmpty() ? null : cursor);
      log.debug("Polling finished");
    } catch (InterruptException kafkaInterruptException) {
      log.debug("Polling finished due to thread interruption");
      sink.complete();
    } catch (Exception e) {
      log.error("Error occurred while consuming records", e);
      sink.error(e);
    }
  }

  private List<ConsumerRecord<Bytes, Bytes>> poll(EnhancedConsumer consumer,
                                                  FluxSink<TopicMessageEventDTO> sink,
                                                  TreeMap<TopicPartition, FromToOffset> range) {
    log.trace("Polling range {}", range);
    sendPhase(sink,
        "Polling partitions: %s".formatted(range.keySet().stream().map(TopicPartition::partition).sorted().toList()));

    consumer.assign(range.keySet());
    range.forEach((tp, fromTo) -> consumer.seek(tp, fromTo.from));

    List<ConsumerRecord<Bytes, Bytes>> result = new ArrayList<>();
    Set<TopicPartition> paused = new HashSet<>();
    while (!sink.isCancelled() && paused.size() < range.size() && !isScanBudgetExceeded()) {
      var polledRecords = consumer.pollEnhanced(getPollingSettings().getPollTimeout());
      // budget intentionally counts all polled records (including out-of-range overshoot):
      // it caps broker-side work, not user-visible progress
      scannedRecords += polledRecords.count();
      int sizeBeforeFiltering = result.size();
      range.forEach((tp, fromTo) -> {
        polledRecords.records(tp).stream()
            .filter(r -> r.offset() < fromTo.to)
            .forEach(result::add);

        //next position is out of target range -> pausing partition
        if (!paused.contains(tp) && consumer.position(tp) >= fromTo.to) {
          paused.add(tp);
          consumer.pause(List.of(tp));
        }
      });
      //only counting in-range records, since out-of-range ones will be polled & sent again
      sendConsuming(sink, polledRecords, result.size() - sizeBeforeFiltering);
    }
    consumer.resume(paused);
    return result;
  }

  private boolean isScanBudgetExceeded() {
    if (scannedRecords >= getPollingSettings().getMaxScannedRecords()) {
      log.debug("Stopping polling: scanned records budget exceeded ({} records scanned)", scannedRecords);
      return true;
    }
    if (Duration.between(pollingStartedAt, Instant.now())
        .compareTo(getPollingSettings().getResponseTimeout()) >= 0) {
      log.debug("Stopping polling: response timeout budget exceeded ({} records scanned)", scannedRecords);
      return true;
    }
    return false;
  }
}
