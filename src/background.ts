import ACTION_TYPE from "./enum/ActionType";
import Bookmark from "./interface/Bookmark";
import Payload from "./interface/Payload";

const OPEN_COUNTS_KEY = "openCounts";
const STARRED_KEY = "starred";

type OpenCounts = { [bookmarkId: string]: number };

const getOpenCounts = async (): Promise<OpenCounts> => {
  const result = await chrome.storage.local.get(OPEN_COUNTS_KEY);
  return result[OPEN_COUNTS_KEY] ?? {};
};

const setOpenCounts = (openCounts: OpenCounts) => {
  return chrome.storage.local.set({ [OPEN_COUNTS_KEY]: openCounts });
};

// Starred bookmark ids, in the order they were starred.
const getStarred = async (): Promise<string[]> => {
  const result = await chrome.storage.local.get(STARRED_KEY);
  return result[STARRED_KEY] ?? [];
};

const setStarred = (starred: string[]) => {
  return chrome.storage.local.set({ [STARRED_KEY]: starred });
};

const getStarredBookmarks = async (): Promise<Bookmark[]> => {
  const starred = await getStarred();
  // Fetch one by one: chrome.bookmarks.get rejects the whole batch when
  // any id is gone.
  const found = await Promise.all(
    starred.map((id) =>
      chrome.bookmarks.get(id).then(
        ([b]) => b,
        () => undefined
      )
    )
  );
  return found
    .filter((b): b is chrome.bookmarks.BookmarkTreeNode => !!b?.url)
    .map((b) => ({ id: b.id, title: b.title, url: b.url, starred: true }));
};

const asyncFunctionWithAwait = async (
  request: Payload,
  _sender: chrome.runtime.MessageSender,
  sendResponse: any
) => {
  if (request.action === ACTION_TYPE.GET_BOOKMARKS) {
    // Empty query is the initial screen: starred bookmarks in star order,
    // not sorted by open count.
    if (!request.data.trim()) {
      sendResponse({ bookmarks: await getStarredBookmarks() });
      return;
    }

    const [searchedBookmarks, openCounts, starred] = await Promise.all([
      chrome.bookmarks.search(request.data),
      getOpenCounts(),
      getStarred(),
    ]);
    const bookmarks = searchedBookmarks
      .filter((b: Bookmark) => b.id && b.url)
      .map((b: Bookmark) => {
        return {
          id: b.id,
          title: b.title,
          url: b.url,
          starred: starred.includes(b.id),
        };
      })
      // Most opened first. Sort is stable, so ties keep Chrome's order.
      .sort((a, b) => (openCounts[b.id] ?? 0) - (openCounts[a.id] ?? 0));

    sendResponse({ bookmarks: bookmarks });
  }

  if (request.action === ACTION_TYPE.OPEN_BOOKMARK) {
    const [bookmark] = await chrome.bookmarks.get(request.data);
    if (!bookmark?.url) return;

    const openCounts = await getOpenCounts();
    openCounts[bookmark.id] = (openCounts[bookmark.id] ?? 0) + 1;
    await setOpenCounts(openCounts);

    await chrome.tabs.create({ url: bookmark.url });
  }

  if (request.action === ACTION_TYPE.TOGGLE_STAR) {
    const starred = await getStarred();
    const isStarred = starred.includes(request.data);
    await setStarred(
      isStarred
        ? starred.filter((id) => id !== request.data)
        : [...starred, request.data]
    );
    sendResponse({ starred: !isStarred });
  }
};

chrome.runtime.onMessage.addListener(
  (
    request: Payload,
    sender: chrome.runtime.MessageSender,
    sendResponse: any
  ) => {
    asyncFunctionWithAwait(request, sender, sendResponse);
    return true;
  }
);

chrome.bookmarks.onRemoved.addListener(async (id: string) => {
  const openCounts = await getOpenCounts();
  if (id in openCounts) {
    delete openCounts[id];
    await setOpenCounts(openCounts);
  }

  const starred = await getStarred();
  if (starred.includes(id)) {
    await setStarred(starred.filter((starredId) => starredId !== id));
  }
});
