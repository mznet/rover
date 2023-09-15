import ACTION_TYPE from "./enum/ActionType";
import Bookmark from "./interface/Bookmark";
import Payload from "./interface/Payload";

const asyncFunctionWithAwait = async (
  request: Payload,
  _sender: chrome.runtime.MessageSender,
  sendResponse: any
) => {
  if (request.action === ACTION_TYPE.GET_BOOKMARKS) {
    const searchedBookmarks = await chrome.bookmarks.search(request.data);
    const bookmarks = searchedBookmarks
      .filter((b: Bookmark) => b.id && b.url)
      .map((b: Bookmark) => {
        return { id: b.id, title: b.title, url: b.url };
      });

    sendResponse({ bookmarks: bookmarks });
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
