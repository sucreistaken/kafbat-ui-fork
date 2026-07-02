package io.kafbat.ui.emitter;

import io.kafbat.ui.model.TopicMessageConsumingDTO;
import io.kafbat.ui.model.TopicMessageEventDTO;
import io.kafbat.ui.model.TopicMessageNextPageCursorDTO;
import javax.annotation.Nullable;
import reactor.core.publisher.FluxSink;

class ConsumingStats {

  private long bytes = 0;
  private int records = 0;
  private long elapsed = 0;
  private int filterApplyErrors = 0;

  // countedRecords may be less than polledRecords.count() if some of the polled
  // records are out of the requested range and will be polled (and sent) again later
  void sendConsumingEvt(FluxSink<TopicMessageEventDTO> sink, PolledRecords polledRecords, int countedRecords) {
    bytes += polledRecords.bytes();
    records += countedRecords;
    elapsed += polledRecords.elapsed().toMillis();
    sink.next(
        new TopicMessageEventDTO()
            .type(TopicMessageEventDTO.TypeEnum.CONSUMING)
            .consuming(createConsumingStats())
    );
  }

  void incFilterApplyError() {
    filterApplyErrors++;
  }

  void sendFinishEvent(FluxSink<TopicMessageEventDTO> sink, @Nullable Cursor.Tracking cursor) {
    sink.next(
        new TopicMessageEventDTO()
            .type(TopicMessageEventDTO.TypeEnum.DONE)
            .cursor(
                cursor != null
                    ? new TopicMessageNextPageCursorDTO().id(cursor.registerCursor())
                    : null
            )
            .consuming(createConsumingStats())
    );
  }

  private TopicMessageConsumingDTO createConsumingStats() {
    return new TopicMessageConsumingDTO()
        .bytesConsumed(bytes)
        .elapsedMs(elapsed)
        .isCancelled(false)
        .filterApplyErrors(filterApplyErrors)
        .messagesConsumed(records);
  }
}
