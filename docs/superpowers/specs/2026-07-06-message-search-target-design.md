# Message Search Target Design

## Goal

Let users choose where the simple topic message search runs: all fields, key, value, or headers. The default remains the current behavior so existing users, links, and API callers continue searching all fields unless they opt into a narrower target.

## User Behavior

The topic Messages filter bar gets a compact selector next to the existing `Search` input.

Options:

- `All`: default, current behavior. Search matches message key, value, or headers.
- `Key`: search matches only the message key.
- `Value`: search matches only the message value.
- `Headers`: search matches only header names or header values.

When the search text is empty, the selected target does not filter messages by itself. It only changes the behavior of `stringFilter`.

The selected target is persisted in the page URL and the existing per-topic local storage filter state, matching the current message filter behavior. Refreshing the page or sharing a URL preserves the choice. If the URL has no target parameter, the UI and backend use `All`.

## API Contract

Add an optional `stringFilterTarget` query parameter to `GET /api/clusters/{clusterName}/topics/{topicName}/messages/v2`.

Allowed values:

- `ALL`
- `KEY`
- `VALUE`
- `HEADERS`

If `stringFilterTarget` is absent or blank, backend behavior is `ALL`. Cursor requests keep the existing rule: when `cursor` is supplied, other query params are ignored because cursor state already represents the previous polling request.

## Backend Design

The generated controller interface receives `StringFilterTargetDTO stringFilterTarget`. `MessagesController#getTopicMessagesV2` passes it into `MessagesService#loadMessages`.

`MessagesService#getMsgFilter` keeps composing filters the same way:

1. Start with `MessageFilters.noop()`.
2. If `stringFilter` is present, append `MessageFilters.containsStringFilter(stringFilter, target)`.
3. If `smartFilterId` is present, append the registered CEL predicate.

`MessageFilters` owns the field-specific matching logic. It keeps the current non-ASCII JSON escape fallback for all targets:

- `ALL`: key OR value OR headers.
- `KEY`: key only.
- `VALUE`: value only.
- `HEADERS`: header name OR header value.

Null key, value, or headers never match and never throw.

## Frontend Design

Add `stringFilterTarget` to `MessagesFilterKeys`.

`useMessagesFilters` reads the target from `URLSearchParams`, defaults to `ALL`, exposes `searchTarget`, and exposes `setSearchTarget`. It persists the target through the existing `useMessagesFiltersFields` helper.

`useTopicMessages` forwards `stringFilterTarget` to the SSE request only when the URL contains a value. Backend defaulting covers old URLs and direct requests.

`Filters.tsx` renders a small select next to the search box. The select uses the existing `Select` component and options `All`, `Key`, `Value`, `Headers`.

## Testing

Backend tests:

- `MessageFiltersTest` proves `ALL` keeps current key, value, and headers matching.
- `MessageFiltersTest` proves `KEY` does not match value/header text.
- `MessageFiltersTest` proves `VALUE` does not match key/header text.
- `MessageFiltersTest` proves `HEADERS` matches header names and values, but not key/value text.
- `MessageFiltersTest` covers null-safe misses.

Frontend tests:

- `Filters.spec.tsx` proves the selector defaults to `All`.
- `Filters.spec.tsx` proves changing the selector writes `stringFilterTarget` to filter state/search params.
- `topicMessages` API hook test proves the SSE URL includes `stringFilterTarget` when present.

## Out of Scope

- Multi-select search targets such as `Key + Headers`.
- Changing CEL smart filter behavior.
- Changing indexing, Kafka consumption, or the existing search budget.
- Changing the default from current behavior to value-only search.
