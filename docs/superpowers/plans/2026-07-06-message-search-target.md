# Message Search Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional message search target selector so the simple topic message search can run against all fields, key, value, or headers.

**Architecture:** Extend the OpenAPI contract with `stringFilterTarget`, pass it through controller and service layers, and keep matching logic centralized in `MessageFilters`. The frontend stores the selected target in existing URL/local-storage filter state and sends it with the SSE request.

**Tech Stack:** Java/Spring WebFlux backend, OpenAPI-generated Java/TypeScript contract sources, React/TypeScript frontend, Jest frontend tests, JUnit backend tests.

---

## File Structure

- Modify `contract/src/main/resources/swagger/kafbat-ui-api.yaml`: add `stringFilterTarget` query param and enum schema.
- Modify generated backend contract files under `contract/build/generated/...` only through Gradle generation if available.
- Modify `api/src/main/java/io/kafbat/ui/controller/MessagesController.java`: accept and forward target.
- Modify `api/src/main/java/io/kafbat/ui/service/MessagesService.java`: accept target in `loadMessages` and `getMsgFilter`.
- Modify `api/src/main/java/io/kafbat/ui/emitter/MessageFilters.java`: add field-targeted contains matching.
- Modify `api/src/test/java/io/kafbat/ui/emitter/MessageFiltersTest.java`: add target-specific tests first.
- Modify `frontend/src/lib/constants.ts`: add `stringFilterTarget`.
- Modify `frontend/src/lib/hooks/useMessagesFilters.ts`: read/set target.
- Modify `frontend/src/lib/hooks/useMessagesFiltersFields.ts`: persist target.
- Modify `frontend/src/lib/hooks/api/topicMessages.tsx`: forward target to `/messages/v2`.
- Modify `frontend/src/components/Topics/Topic/Messages/Filters/Filters.tsx`: render selector next to search input.
- Modify `frontend/src/components/Topics/Topic/Messages/Filters/__tests__/Filters.spec.tsx`: add selector tests.
- Modify or add frontend hook tests for the SSE request parameter.

### Task 1: Backend Failing Tests

**Files:**
- Modify: `api/src/test/java/io/kafbat/ui/emitter/MessageFiltersTest.java`

- [ ] **Step 1: Write failing tests**

Add tests inside `StringContainsFilter`:

```java
@Test
void allTargetMatchesKeyValueAndHeaders() {
  var allFilter = containsStringFilter("needle", StringFilterTargetDTO.ALL);

  assertTrue(allFilter.test(msg().key("needle-key").value("other")));
  assertTrue(allFilter.test(msg().key("other").value("needle-value")));
  assertTrue(allFilter.test(msg().key("other").value("other").headers(Map.of("x-needle", "value"))));
  assertTrue(allFilter.test(msg().key("other").value("other").headers(Map.of("x", "needle-value"))));
}

@Test
void keyTargetMatchesOnlyKey() {
  var keyFilter = containsStringFilter("needle", StringFilterTargetDTO.KEY);

  assertTrue(keyFilter.test(msg().key("needle-key").value("other").headers(Map.of("x", "other"))));
  assertFalse(keyFilter.test(msg().key("other").value("needle-value").headers(Map.of("x", "needle-header"))));
}

@Test
void valueTargetMatchesOnlyValue() {
  var valueFilter = containsStringFilter("needle", StringFilterTargetDTO.VALUE);

  assertTrue(valueFilter.test(msg().key("other").value("needle-value").headers(Map.of("x", "other"))));
  assertFalse(valueFilter.test(msg().key("needle-key").value("other").headers(Map.of("x", "needle-header"))));
}

@Test
void headersTargetMatchesOnlyHeaderNamesAndValues() {
  var headersFilter = containsStringFilter("needle", StringFilterTargetDTO.HEADERS);

  assertTrue(headersFilter.test(msg().key("other").value("other").headers(Map.of("x-needle", "value"))));
  assertTrue(headersFilter.test(msg().key("other").value("other").headers(Map.of("x", "needle-value"))));
  assertFalse(headersFilter.test(msg().key("needle-key").value("needle-value")));
}

@Test
void targetFiltersAreNullSafe() {
  assertFalse(containsStringFilter("needle", StringFilterTargetDTO.KEY).test(msg().key(null).value(null)));
  assertFalse(containsStringFilter("needle", StringFilterTargetDTO.VALUE).test(msg().key(null).value(null)));
  assertFalse(containsStringFilter("needle", StringFilterTargetDTO.HEADERS).test(msg().key(null).value(null)));
}
```

Also import:

```java
import io.kafbat.ui.model.StringFilterTargetDTO;
```

- [ ] **Step 2: Verify tests fail for missing API**

Run:

```bash
./gradlew :api:test --tests io.kafbat.ui.emitter.MessageFiltersTest
```

Expected: compile failure because `StringFilterTargetDTO` or `containsStringFilter(String, StringFilterTargetDTO)` is missing.

### Task 2: Backend Implementation

**Files:**
- Modify: `contract/src/main/resources/swagger/kafbat-ui-api.yaml`
- Modify: `api/src/main/java/io/kafbat/ui/emitter/MessageFilters.java`
- Modify: `api/src/main/java/io/kafbat/ui/service/MessagesService.java`
- Modify: `api/src/main/java/io/kafbat/ui/controller/MessagesController.java`

- [ ] **Step 1: Add contract enum and query param**

Add `stringFilterTarget` after `stringFilter` in the `/messages/v2` query params and add schema:

```yaml
StringFilterTarget:
  type: string
  enum:
    - ALL
    - KEY
    - VALUE
    - HEADERS
```

- [ ] **Step 2: Generate contract sources**

Run:

```bash
./gradlew :contract:generateBackendApi
```

Expected: generated Java API/model includes `StringFilterTargetDTO`.

- [ ] **Step 3: Implement matching**

Add overload in `MessageFilters`:

```java
public static Predicate<TopicMessageDTO> containsStringFilter(String string, StringFilterTargetDTO target) {
  @Nullable String escapedUpper = escapeNonAscii(string);
  @Nullable String escapedLower = escapedUpper != null
      ? HEX_IN_UNICODE_ESCAPE.matcher(escapedUpper).replaceAll(m -> m.group().toLowerCase())
      : null;
  var effectiveTarget = target == null ? StringFilterTargetDTO.ALL : target;
  return msg -> msgContains(msg, string, effectiveTarget)
      || (escapedUpper != null && msgContains(msg, escapedUpper, effectiveTarget))
      || (escapedLower != null && msgContains(msg, escapedLower, effectiveTarget));
}
```

Keep existing `containsStringFilter(String)` as delegating compatibility method.

- [ ] **Step 4: Pass target through service/controller**

Update `MessagesController#getTopicMessagesV2`, `MessagesService#loadMessages`, and `MessagesService#getMsgFilter` signatures to pass `StringFilterTargetDTO`.

- [ ] **Step 5: Verify backend test passes**

Run:

```bash
./gradlew :api:test --tests io.kafbat.ui.emitter.MessageFiltersTest
```

Expected: PASS.

### Task 3: Frontend Failing Tests

**Files:**
- Modify: `frontend/src/components/Topics/Topic/Messages/Filters/__tests__/Filters.spec.tsx`
- Modify: `frontend/src/lib/hooks/api/__tests__/topicMessages.spec.ts`

- [ ] **Step 1: Write selector tests**

Add expectations that the new select defaults to `All`, accepts `Headers`, and makes `stringFilterTarget=HEADERS` visible in the current URL/search params.

- [ ] **Step 2: Write SSE request test**

Mock `fetchEventSource`, render `useTopicMessages` with URL params `stringFilter=needle&stringFilterTarget=KEY`, and assert the requested URL includes both params.

- [ ] **Step 3: Verify tests fail**

Run:

```bash
cd frontend && pnpm jest src/components/Topics/Topic/Messages/Filters/__tests__/Filters.spec.tsx src/lib/hooks/api/__tests__/topicMessages.spec.ts --runInBand
```

Expected: FAIL because selector/state/request forwarding is missing.

### Task 4: Frontend Implementation

**Files:**
- Modify: `frontend/src/lib/constants.ts`
- Modify: `frontend/src/lib/hooks/useMessagesFilters.ts`
- Modify: `frontend/src/lib/hooks/useMessagesFiltersFields.ts`
- Modify: `frontend/src/lib/hooks/api/topicMessages.tsx`
- Modify: `frontend/src/components/Topics/Topic/Messages/Filters/Filters.tsx`

- [ ] **Step 1: Add constants and options**

Add `stringFilterTarget: 'stringFilterTarget'` to `MessagesFilterKeys`. Use generated enum if available after frontend generation; otherwise define a small local options array matching `ALL`, `KEY`, `VALUE`, `HEADERS`.

- [ ] **Step 2: Persist filter target**

Read target from URL with default `ALL`, expose `searchTarget` and `setSearchTarget`, and include it in `useMessagesFiltersFields` persistence lists.

- [ ] **Step 3: Forward request param**

Include `MessagesFilterKeys.stringFilterTarget` in the SSE request param copy list.

- [ ] **Step 4: Render selector**

Place an existing `Select` beside `Search`:

```tsx
<Select
  id="selectStringFilterTarget"
  aria-labelledby="selectStringFilterTarget"
  onChange={setSearchTarget}
  options={searchTargetOptions}
  value={searchTarget}
  selectSize="M"
  minWidth="110px"
/>
```

- [ ] **Step 5: Verify frontend targeted tests pass**

Run:

```bash
cd frontend && pnpm jest src/components/Topics/Topic/Messages/Filters/__tests__/Filters.spec.tsx src/lib/hooks/api/__tests__/topicMessages.spec.ts --runInBand
```

Expected: PASS.

### Task 5: Full Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run backend targeted test**

```bash
./gradlew :api:test --tests io.kafbat.ui.emitter.MessageFiltersTest
```

Expected: PASS.

- [ ] **Step 2: Run frontend targeted tests**

```bash
cd frontend && pnpm jest src/components/Topics/Topic/Messages/Filters/__tests__/Filters.spec.tsx src/lib/hooks/api/__tests__/topicMessages.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

```bash
cd frontend && pnpm tsc --pretty --noEmit
```

Expected: PASS.

- [ ] **Step 4: Inspect diff**

```bash
git diff --stat
git diff --check
```

Expected: no whitespace errors; diff only includes search target feature plus pre-existing generated OpenAPI change if still present.
