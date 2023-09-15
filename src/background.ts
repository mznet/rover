import ACTION_TYPE from "./enum/ActionType";
import Payload from "./interface/Payload";

const asyncFunctionWithAwait = async (
  request: Payload,
  sender: any,
  sendResponse: any
) => {
  if (request.action === ACTION_TYPE.GET_BOOKMARKS) {
    const searchedBookmarks = await chrome.bookmarks.search(request.data);
    const bookmarks = searchedBookmarks
      .filter((b) => b.id)
      .map((b) => {
        return { id: b.id, title: b.title, url: b.url };
      });

    sendResponse({ bookmarks: bookmarks });
  }
};

chrome.runtime.onMessage.addListener(function (
  request: Payload,
  sender,
  sendResponse
) {
  asyncFunctionWithAwait(request, sender, sendResponse);
  return true;
});
