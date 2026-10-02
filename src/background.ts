import ACTION_TYPE from "./enum/ActionType";
import Bookmark from "./interface/Bookmark";
import Payload from "./interface/Payload";

const OPEN_COUNTS_KEY = "openCounts";

type OpenCounts = { [bookmarkId: string]: number };

const getOpenCounts = async (): Promise<OpenCounts> => {
  const result = await chrome.storage.local.get(OPEN_COUNTS_KEY);
  return result[OPEN_COUNTS_KEY] ?? {};
};

const setOpenCounts = (openCounts: OpenCounts) => {
  return chrome.storage.local.set({ [OPEN_COUNTS_KEY]: openCounts });
};

const asyncFunctionWithAwait = async (
  request: Payload,
  _sender: chrome.runtime.MessageSender,
  sendResponse: any
) => {
  if (request.action === ACTION_TYPE.GET_BOOKMARKS) {
    const [searchedBookmarks, openCounts] = await Promise.all([
      chrome.bookmarks.search(request.data),
      getOpenCounts(),
    ]);
    const bookmarks = searchedBookmarks
      .filter((b: Bookmark) => b.id && b.url)
      .map((b: Bookmark) => {
        return { id: b.id, title: b.title, url: b.url };
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
  if (!(id in openCounts)) return;

  delete openCounts[id];
  await setOpenCounts(openCounts);
});
