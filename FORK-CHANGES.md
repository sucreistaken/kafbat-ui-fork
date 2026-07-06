# What this fork adds

This is a fork of [kafbat/kafka-ui](https://github.com/kafbat/kafka-ui) (Apache-2.0).
It keeps the upstream codebase intact and adds a small set of focused improvements
to the topic **Messages** experience, plus one navigation shortcut. Every change
below is client-side or a narrow backend polling guard; none of them change Kafka
itself or add load beyond what the UI already consumes.

All work sits on the branch `fix/search-polling-budget`.

## 1. Non-blocking message search (scan budget)

**Problem:** a search with no matches would keep scanning the entire topic
indefinitely, holding the request open (upstream issue #442).

**What changed:** search polling now stops when a budget is exhausted, either
`maxScannedRecords` (default 500k) or `responseTimeoutMs` (default 30s). When the
budget runs out it emits a `DONE` event with a non-null cursor so the client can
continue from where it left off. The frontend handles `DONE` and stops the
`fetch-event-source` retry loop instead of spinning.

Based on upstream commit `d0e3a7e`.

- Backend: search polling budget + config guards + rejection handling
- Frontend: `topicMessages.tsx` handles `DONE`, resets/commits scan counters

## 2. "Search entire topic" with a live scanned counter

**Problem:** when a slice returned no matches, the user had to press *Next*
repeatedly to walk the whole topic.

**What changed:** when a slice comes back empty, a **Search entire topic** button
auto-advances through the remaining slices until it either finds a match or reaches
the end. A banner shows the running total ("Scanning entire topic... N messages
scanned"), with a **Stop** button. The counter is the sum of each polling round's
`messagesConsumed`, folded into a running total on every `DONE`.

- `MessagesTable.tsx` (`scanAll` flow), `useMessageFiltersStore.ts`
  (`scannedCommitted` / `scannedCurrent`, `commitScanned`, `resetScan`)

## 3. Sort loaded results

**Problem:** messages were shown only in arrival order; finding the newest/oldest
record or the largest offset meant scanning rows by eye (upstream issue #1203).

**What changed:** the **Offset**, **Partition**, and **Timestamp** column headers
are now click-to-sort. First click sorts descending, second click ascending; the
header arrow shows the direction. Sorting runs on the currently loaded / scanned
set (not a server-side re-index), and is disabled in Live mode so the natural order
of streaming data is preserved.

- `MessagesTable.tsx` (client-side sort), `TableHeaderCell.tsx` (`hint` tooltip)

## 4. Date range filter

**Problem:** time modes were single-ended: "from a time" or "until a time"
separately. "Messages between these two times" was not possible in one step
(upstream issue #240).

**What changed:** in **Since time** (`FROM_TIMESTAMP`) mode there is now an optional
**end** date picker next to the start. The stream is read from the start and cropped
client-side up to the end instant (inclusive). When a slice is entirely past the end,
a "Reached the end of the selected range" note appears and paging stops. Leaving the
end empty keeps the original open-ended behavior.

- `Filters.tsx` / `Filters.styled.ts` (end picker), `MessagesTable.tsx`
  (client-side crop + range-end stop), `useMessageFiltersStore.ts`
  (`rangeEndTimestamp`)

## 5. Charts shortcut on the topic page

A **Charts** button on the topic header links to the visualization view, so jumping
from a topic to its graphs no longer needs manual URL editing.

## Demo environment (not part of this repo)

The local demo stack used to validate the above (single-address nginx gateway,
JMX-backed per-broker Metrics, a 2M-message `test-search` topic) lives in a separate
`kafka-ui-demo/docker-compose.yml` outside this repository. Two settings there worth
noting, since the Metrics tab depends on them:

- Broker exposes JMX: `KAFKA_JMX_PORT: 9101`, `KAFKA_JMX_HOSTNAME: demo-kafka`
- UI points at it: `KAFKA_CLUSTERS_0_METRICS_TYPE: JMX`,
  `KAFKA_CLUSTERS_0_METRICS_PORT: 9101`

Without the UI-side metrics config the backend returned an empty body and the
Metrics tab failed to parse it.
