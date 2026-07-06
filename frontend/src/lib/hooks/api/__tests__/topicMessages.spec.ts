import React, { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderHook, waitFor } from '@testing-library/react';
import { renderQueryHook } from 'lib/testHelpers';
import * as hooks from 'lib/hooks/api/topicMessages';
import fetchMock from 'fetch-mock';
import { UseQueryResult, UseSuspenseQueryResult } from '@tanstack/react-query';
import { SerdeUsage } from 'generated-sources';
import { fetchEventSource } from '@microsoft/fetch-event-source';

jest.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: jest.fn(() => Promise.resolve()),
}));

const clusterName = 'test-cluster';
const topicName = 'test-topic';

const expectQueryWorks = async (
  mock: fetchMock.FetchMockStatic,
  result: {
    current:
      | UseQueryResult<unknown, unknown>
      | UseSuspenseQueryResult<unknown, unknown>;
  }
) => {
  await waitFor(() => expect(result.current.isFetched).toBeTruthy());
  expect(mock.calls()).toHaveLength(1);
  expect(result.current.data).toBeDefined();
};

jest.mock('lib/errorHandling', () => ({
  ...jest.requireActual('lib/errorHandling'),
  showServerError: jest.fn(),
}));

describe('Topic Messages hooks', () => {
  beforeEach(() => fetchMock.restore());

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('handles useSerdes', async () => {
    const path = `/api/clusters/${clusterName}/topics/${topicName}/serdes?use=SERIALIZE`;

    const mock = fetchMock.getOnce(path, {});
    const { result } = renderQueryHook(() =>
      hooks.useSerdes({ clusterName, topicName, use: SerdeUsage.SERIALIZE })
    );
    await expectQueryWorks(mock, result);
  });

  it('sends string filter target to message stream request', async () => {
    const wrapper = ({ children }: PropsWithChildren) => React.createElement(
      MemoryRouter,
      {
        initialEntries: [
          `/ui/clusters/${clusterName}/topics/${topicName}/messages?mode=LATEST&stringFilter=needle&stringFilterTarget=KEY`,
        ],
      },
      children
    );

    renderHook(() => hooks.useTopicMessages({ clusterName, topicName }), {
      wrapper,
    });

    await waitFor(() => expect(fetchEventSource).toHaveBeenCalled());

    const [url] = (fetchEventSource as jest.Mock).mock.calls[0];
    expect(url).toContain('stringFilter=needle');
    expect(url).toContain('stringFilterTarget=KEY');
  });
});
