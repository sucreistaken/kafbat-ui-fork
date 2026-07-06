import PageLoader from 'components/common/PageLoader/PageLoader';
import { Table } from 'components/common/table/Table/Table.styled';
import TableHeaderCell from 'components/common/table/TableHeaderCell/TableHeaderCell';
import { SortOrder, TopicMessage } from 'generated-sources';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'components/common/Button/Button';
import * as S from 'components/common/NewTable/Table.styled';
import { usePaginateTopics, useIsLiveMode } from 'lib/hooks/useMessagesFilters';
import { useMessageFiltersStore } from 'lib/hooks/useMessageFiltersStore';
import useAppParams from 'lib/hooks/useAppParams';
import { RouteParamsClusterTopic } from 'lib/paths';
import { useLocalStorage } from 'lib/hooks/useLocalStorage';

import Message, { PreviewFilter } from './Message';
import PreviewModal from './PreviewModal';

export interface MessagesTableProps {
  messages: TopicMessage[];
  isFetching: boolean;
  abortFetchData?: () => void;
}

interface MessagePreviewProps {
  [key: string]: {
    keyFilters: PreviewFilter[];
    contentFilters: PreviewFilter[];
  };
}

const MessagesTable: React.FC<MessagesTableProps> = ({
  messages,
  isFetching,
  abortFetchData,
}) => {
  const paginate = usePaginateTopics();
  const [previewFor, setPreviewFor] = useState<'key' | 'content' | null>(null);
  const [keyFilters, setKeyFilters] = useState<PreviewFilter[]>([]);
  const [contentFilters, setContentFilters] = useState<PreviewFilter[]>([]);
  const nextCursor = useMessageFiltersStore((state) => state.nextCursor);
  const scanAll = useMessageFiltersStore((state) => state.scanAll);
  const setScanAll = useMessageFiltersStore((state) => state.setScanAll);
  const scannedTotal = useMessageFiltersStore(
    (state) => state.scannedCommitted + state.scannedCurrent
  );
  const rangeEnd = useMessageFiltersStore((state) => state.rangeEndTimestamp);
  const isLive = useIsLiveMode();

  // Yuklenen sonuclari client-side siralama. Baslik tiklaninca ayni sutunda
  // ASC/DESC arasinda gecer, yeni sutunda DESC ile baslar.
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>(SortOrder.DESC);

  const handleOrderBy = useCallback((value: string | null) => {
    if (!value) return;
    setOrderBy((prev) => {
      if (prev === value) {
        setSortOrder((o) =>
          o === SortOrder.DESC ? SortOrder.ASC : SortOrder.DESC
        );
        return prev;
      }
      setSortOrder(SortOrder.DESC);
      return value;
    });
  }, []);

  // Yalnizca o an yuklu/taranmis seti siralar (tum topic'i degil). Live modda
  // dokunma: akan verinin dogal sirasi bozulmasin.
  const sortedMessages = useMemo(() => {
    if (!orderBy || isLive) return messages;
    const dir = sortOrder === SortOrder.ASC ? 1 : -1;
    const val = (m: TopicMessage) => {
      if (orderBy === 'timestamp') return new Date(m.timestamp).getTime();
      if (orderBy === 'partition') return m.partition;
      return m.offset;
    };
    return [...messages].sort((a, b) => (val(a) - val(b)) * dir);
  }, [messages, orderBy, sortOrder, isLive]);

  // Tarih araligi ust siniri: yuklenen mesajlari client-side kirp (bitis dahil).
  const displayMessages = useMemo(() => {
    if (!rangeEnd) return sortedMessages;
    return sortedMessages.filter(
      (m) => new Date(m.timestamp).getTime() <= rangeEnd
    );
  }, [sortedMessages, rangeEnd]);

  // FROM_TIMESTAMP ileri (artan zaman) okur; bir dilimdeki tum mesajlar bitisi
  // asmissa aralik penceresi bitmistir, ilerlemeyi durdur.
  const passedRange = useMemo(() => {
    if (!rangeEnd || messages.length === 0) return false;
    return messages.every((m) => new Date(m.timestamp).getTime() > rangeEnd);
  }, [messages, rangeEnd]);

  // "Tum topic'te ara": bos donen tarama dilimlerinde, kullaniciyi tekrar
  // tekrar Next'e bastirmak yerine otomatik olarak bir sonraki dilime gec.
  // Eslesme cikinca ya da topic bitince dur (mevcut davranisi korur).
  useEffect(() => {
    if (!scanAll || isFetching) return;
    if (messages.length > 0) {
      setScanAll(false); // eslesme bulundu -> dur
    } else if (nextCursor) {
      paginate(); // bu dilim bos, devami var -> otomatik devam et
    } else {
      setScanAll(false); // tum topic tarandi, eslesme yok
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanAll, isFetching, messages.length, nextCursor]);
  const { topicName } = useAppParams<RouteParamsClusterTopic>();
  const [messagesPreview, setMessagesPreview] =
    useLocalStorage<MessagePreviewProps>('message-preview', {
      [topicName]: {
        keyFilters: [],
        contentFilters: [],
      },
    });

  useEffect(() => {
    setKeyFilters(messagesPreview[topicName]?.keyFilters || []);
    setContentFilters(messagesPreview[topicName]?.contentFilters || []);
  }, []);

  const setFilters = useCallback(
    (payload: PreviewFilter[]) => {
      if (previewFor === 'key') {
        setKeyFilters(payload);
        setMessagesPreview({
          ...messagesPreview,
          [topicName]: {
            ...messagesPreview[topicName],
            keyFilters: payload,
          },
        });
      } else {
        setContentFilters(payload);
        setMessagesPreview({
          ...messagesPreview,
          [topicName]: {
            ...messagesPreview[topicName],
            contentFilters: payload,
          },
        });
      }
    },
    [previewFor, messagesPreview, topicName]
  );

  return (
    <div style={{ position: 'relative' }}>
      {previewFor !== null && (
        <PreviewModal
          values={previewFor === 'key' ? keyFilters : contentFilters}
          toggleIsOpen={() => setPreviewFor(null)}
          setFilters={setFilters}
        />
      )}
      <Table isFullwidth>
        <thead>
          <tr>
            <TableHeaderCell> </TableHeaderCell>
            <TableHeaderCell
              title="Offset"
              orderValue="offset"
              orderBy={orderBy}
              sortOrder={sortOrder}
              handleOrderBy={isLive ? undefined : handleOrderBy}
              hint={isLive ? undefined : 'Sorts the loaded results'}
            />
            <TableHeaderCell
              title="Partition"
              orderValue="partition"
              orderBy={orderBy}
              sortOrder={sortOrder}
              handleOrderBy={isLive ? undefined : handleOrderBy}
              hint={isLive ? undefined : 'Sorts the loaded results'}
            />
            <TableHeaderCell
              title="Timestamp"
              orderValue="timestamp"
              orderBy={orderBy}
              sortOrder={sortOrder}
              handleOrderBy={isLive ? undefined : handleOrderBy}
              hint={isLive ? undefined : 'Sorts the loaded results'}
            />
            <TableHeaderCell
              title="Key"
              previewText={`Preview ${
                keyFilters.length ? `(${keyFilters.length} selected)` : ''
              }`}
              onPreview={() => setPreviewFor('key')}
            />
            <TableHeaderCell
              title="Value"
              previewText={`Preview ${
                contentFilters.length
                  ? `(${contentFilters.length} selected)`
                  : ''
              }`}
              onPreview={() => setPreviewFor('content')}
            />
            <TableHeaderCell> </TableHeaderCell>
          </tr>
        </thead>
        <tbody>
          {displayMessages.map((message: TopicMessage) => (
            <Message
              key={[
                message.offset,
                message.timestamp,
                message.key,
                message.partition,
              ].join('-')}
              message={message}
              keyFilters={keyFilters}
              contentFilters={contentFilters}
            />
          ))}
          {isFetching && !messages.length && !scanAll && (
            <tr>
              <td colSpan={10}>
                <PageLoader />
              </td>
            </tr>
          )}
          {scanAll && (
            <tr>
              <td colSpan={10}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    padding: '4px 0',
                  }}
                >
                  <span>
                    Scanning entire topic... {scannedTotal.toLocaleString()}{' '}
                    messages scanned
                  </span>
                  <Button
                    buttonType="secondary"
                    buttonSize="M"
                    onClick={() => {
                      setScanAll(false);
                      abortFetchData?.();
                    }}
                  >
                    Stop
                  </Button>
                </div>
              </td>
            </tr>
          )}
          {passedRange && !isFetching && !scanAll && (
            <tr>
              <td colSpan={10}>Reached the end of the selected range.</td>
            </tr>
          )}
          {messages.length === 0 && !isFetching && !scanAll && (
            <tr>
              <td colSpan={10}>
                {nextCursor ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                      padding: '4px 0',
                    }}
                  >
                    <span>
                      No matches in this slice
                      {scannedTotal > 0
                        ? ` (${scannedTotal.toLocaleString()} messages scanned)`
                        : ''}
                      .
                    </span>
                    <Button
                      buttonType="primary"
                      buttonSize="M"
                      onClick={() => setScanAll(true)}
                    >
                      Search entire topic
                    </Button>
                  </div>
                ) : scannedTotal > 0 ? (
                  `Scanned the entire topic (${scannedTotal.toLocaleString()} messages), no matches found.`
                ) : (
                  'No messages found'
                )}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <S.Pagination>
        <S.Pages>
          {!scanAll && (
            <Button
              disabled={isLive || isFetching || !nextCursor || passedRange}
              buttonType="secondary"
              buttonSize="L"
              onClick={paginate}
            >
              Next →
            </Button>
          )}
        </S.Pages>
      </S.Pagination>
    </div>
  );
};

export default MessagesTable;
