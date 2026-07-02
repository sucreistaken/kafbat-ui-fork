package io.kafbat.ui.emitter;

import io.kafbat.ui.config.ClustersProperties;
import java.time.Duration;
import java.util.Optional;
import java.util.function.Supplier;

public class PollingSettings {

  private static final Duration DEFAULT_POLL_TIMEOUT = Duration.ofMillis(1_000);
  private static final Duration DEFAULT_RESPONSE_TIMEOUT = Duration.ofMillis(30_000);
  private static final int DEFAULT_MAX_SCANNED_RECORDS = 500_000;

  private final Duration pollTimeout;
  private final Duration responseTimeout;
  private final int maxScannedRecords;
  private final Supplier<PollingThrottler> throttlerSupplier;

  public static PollingSettings create(ClustersProperties.Cluster cluster,
                                       ClustersProperties clustersProperties) {
    var pollingProps = Optional.ofNullable(clustersProperties.getPolling())
        .orElseGet(ClustersProperties.PollingProperties::new);

    var pollTimeout = pollingProps.getPollTimeoutMs() != null
        ? Duration.ofMillis(pollingProps.getPollTimeoutMs())
        : DEFAULT_POLL_TIMEOUT;

    // non-positive values are treated as misconfiguration and fall back to defaults
    var responseTimeout = pollingProps.getResponseTimeoutMs() != null && pollingProps.getResponseTimeoutMs() > 0
        ? Duration.ofMillis(pollingProps.getResponseTimeoutMs())
        : DEFAULT_RESPONSE_TIMEOUT;

    var maxScannedRecords = pollingProps.getMaxScannedRecords() != null && pollingProps.getMaxScannedRecords() > 0
        ? pollingProps.getMaxScannedRecords()
        : DEFAULT_MAX_SCANNED_RECORDS;

    return new PollingSettings(
        pollTimeout,
        responseTimeout,
        maxScannedRecords,
        PollingThrottler.throttlerSupplier(cluster)
    );
  }

  public static PollingSettings createDefault() {
    return new PollingSettings(
        DEFAULT_POLL_TIMEOUT,
        DEFAULT_RESPONSE_TIMEOUT,
        DEFAULT_MAX_SCANNED_RECORDS,
        PollingThrottler::noop
    );
  }

  private PollingSettings(Duration pollTimeout,
                          Duration responseTimeout,
                          int maxScannedRecords,
                          Supplier<PollingThrottler> throttlerSupplier) {
    this.pollTimeout = pollTimeout;
    this.responseTimeout = responseTimeout;
    this.maxScannedRecords = maxScannedRecords;
    this.throttlerSupplier = throttlerSupplier;
  }

  public Duration getPollTimeout() {
    return pollTimeout;
  }

  public Duration getResponseTimeout() {
    return responseTimeout;
  }

  public int getMaxScannedRecords() {
    return maxScannedRecords;
  }

  public PollingThrottler getPollingThrottler() {
    return throttlerSupplier.get();
  }
}
