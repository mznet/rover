import ACTION_TYPE from "./enum/ActionType";
import Bookmark from "./interface/Bookmark";
import Payload from "./interface/Payload";

const OPEN_COUNTS_KEY = "openCounts";
const TAGS_KEY = "tags";

type OpenCounts = { [bookmarkId: string]: number };
type Tags = { [bookmarkId: string]: string[] };

const getOpenCounts = async (): Promise<OpenCounts> => {
  const result = await chrome.storage.local.get(OPEN_COUNTS_KEY);
  return result[OPEN_COUNTS_KEY] ?? {};
};

const setOpenCounts = (openCounts: OpenCounts) => {
  return chrome.storage.local.set({ [OPEN_COUNTS_KEY]: openCounts });
};

const getTags = async (): Promise<Tags> => {
  const result = await chrome.storage.local.get(TAGS_KEY);
  return result[TAGS_KEY] ?? {};
};

const setTags = (tags: Tags) => {
  return chrome.storage.local.set({ [TAGS_KEY]: tags });
};

// Every tag in use, alphabetically, for the initial screen's tabs.
const tagNames = (tags: Tags) =>
  Array.from(new Set(Object.values(tags).flat())).sort((a, b) =>
    a.localeCompare(b)
  );

// Trimmed, non-empty and unique, in the order given.
const cleanTags = (tags: string[] = []) =>
  Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));

const toBookmark = (
  b: chrome.bookmarks.BookmarkTreeNode,
  tags: Tags
): Bookmark => ({
  id: b.id,
  title: b.title,
  url: b.url,
  tags: tags[b.id] ?? [],
});

const getBookmarksByIds = async (
  ids: string[],
  tags: Tags
): Promise<Bookmark[]> => {
  // Fetch one by one: chrome.bookmarks.get rejects the whole batch when
  // any id is gone.
  const found = await Promise.all(
    ids.map((id) =>
      chrome.bookmarks.get(id).then(
        ([b]) => b,
        () => undefined
      )
    )
  );
  return found
    .filter((b): b is chrome.bookmarks.BookmarkTreeNode => !!b?.url)
    .map((b) => toBookmark(b, tags));
};

const asyncFunctionWithAwait = async (
  request: Payload,
  _sender: chrome.runtime.MessageSender,
  sendResponse: any
) => {
  if (request.action === ACTION_TYPE.GET_BOOKMARKS) {
    const [openCounts, tags] = await Promise.all([getOpenCounts(), getTags()]);
    const byOpenCount = (a: Bookmark, b: Bookmark) =>
      (openCounts[b.id] ?? 0) - (openCounts[a.id] ?? 0);

    // Empty query is the initial screen: one tag's bookmarks, most opened
    // first (the first tag when none is asked). Tag names feed the tabs.
    if (!request.data.trim()) {
      const names = tagNames(tags);
      const tag = request.tag ?? names[0] ?? null;
      const ids = Object.keys(tags).filter((id) => tags[id].includes(tag));
      const bookmarks = (await getBookmarksByIds(ids, tags)).sort(byOpenCount);
      sendResponse({ bookmarks, tags: names, tag });
      return;
    }

    const searchedBookmarks = await chrome.bookmarks.search(request.data);
    const bookmarks = searchedBookmarks
      .filter((b) => b.id && b.url)
      .map((b) => toBookmark(b, tags))
      // Most opened first. Sort is stable, so ties keep Chrome's order.
      .sort(byOpenCount);

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

  if (request.action === ACTION_TYPE.SET_TAGS) {
    const tags = await getTags();
    const next = cleanTags(request.tags);
    if (next.length) tags[request.data] = next;
    else delete tags[request.data];
    await setTags(tags);
    sendResponse({ tags: next });
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

  const tags = await getTags();
  if (id in tags) {
    delete tags[id];
    await setTags(tags);
  }
});
