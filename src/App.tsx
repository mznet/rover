import React, { useEffect, useRef, useState } from "react";
import { InputGroup, ListGroup } from "react-bootstrap";
import Form from "react-bootstrap/Form";
import Bookmark from "./interface/Bookmark";
import ACTION_TYPE from "./enum/ActionType";
import Payload from "./interface/Payload";
import Highlight from "./component/Highlight";

const MAX_BOOKMARKS_COUNT = 8;
const MAX_STARRED_COUNT = 15;
// How long the "opening" effect plays before the new tab steals focus
// and closes the popup.
const LAUNCH_DELAY_MS = 250;
// Rows that render within this window after opening play the intro.
const INTRO_MS = 600;
// How long to wait for a second digit after "1" when 10+ items exist.
const SECOND_DIGIT_WAIT_MS = 600;

const sendMessage = (payload: Payload, callback?: (response: any) => void) => {
  // chrome.* is missing outside the extension (dev server, tests).
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
  if (callback) chrome.runtime.sendMessage(payload, callback);
  else chrome.runtime.sendMessage(payload);
};

// Chrome's built-in favicon cache (needs the "favicon" permission).
// Returns null outside the extension, where the bookmark icon is used.
const faviconUrl = (pageUrl?: string): string | null => {
  if (!pageUrl || typeof chrome === "undefined" || !chrome.runtime?.getURL)
    return null;
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
};

const digitOf = (code: string): number | null => {
  const match = /^(?:Digit|Numpad)(\d)$/.exec(code);
  return match ? Number(match[1]) : null;
};

function App() {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [keyword, setKeyword] = useState<string>("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [indexMode, setIndexMode] = useState<boolean>(false);
  const [launchingIndex, setLaunchingIndex] = useState<number | null>(null);
  const [intro, setIntro] = useState<boolean>(true);
  const inputRef = useRef<HTMLInputElement>(null); //ts
  const lastRequestIdRef = useRef<number>(0);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pendingDigitRef = useRef<{ digit: number; timer: number } | null>(
    null
  );

  const isInitialScreen = keyword.trim() === "";

  const openBookmark = (index: number) => {
    const bookmark = bookmarks[index];
    if (!bookmark?.url || launchingIndex !== null) return;

    setActiveIndex(index);
    setLaunchingIndex(index);

    const payload: Payload = {
      action: ACTION_TYPE.OPEN_BOOKMARK,
      data: bookmark.id,
    };

    window.setTimeout(() => sendMessage(payload), LAUNCH_DELAY_MS);
  };

  const toggleStar = (e: React.MouseEvent, bookmark: Bookmark) => {
    e.stopPropagation();
    const payload: Payload = {
      action: ACTION_TYPE.TOGGLE_STAR,
      data: bookmark.id,
    };

    sendMessage(payload, (response) => {
      if (!response) return;
      const starred: boolean = response.starred;

      // Keep the row in place even on the initial screen, so a star
      // turned off by mistake can be turned back on. It drops off the
      // initial screen the next time the popup opens.
      setBookmarks((prev) =>
        prev.map((b) => (b.id === bookmark.id ? { ...b, starred } : b))
      );
    });
  };

  const clearPendingDigit = () => {
    if (pendingDigitRef.current) {
      window.clearTimeout(pendingDigitRef.current.timer);
      pendingDigitRef.current = null;
    }
  };

  const openByNumber = (number: number) => {
    if (number >= 1 && number <= bookmarks.length) openBookmark(number - 1);
  };

  const handleIndexDigit = (digit: number) => {
    const pending = pendingDigitRef.current;
    if (pending) {
      clearPendingDigit();
      openByNumber(pending.digit * 10 + digit);
      return;
    }

    // "1" may be the start of 10..15, so wait briefly for a second digit.
    if (digit === 1 && bookmarks.length >= 10) {
      const timer = window.setTimeout(() => {
        pendingDigitRef.current = null;
        openByNumber(1);
      }, SECOND_DIGIT_WAIT_MS);
      pendingDigitRef.current = { digit, timer };
      setActiveIndex(0);
      return;
    }

    openByNumber(digit);
  };

  const handleMouseMove = (
    e: React.MouseEvent<HTMLElement>,
    index: number
  ) => {
    // When the list re-renders under a resting pointer, Chrome reports
    // the new item as hovered without the mouse moving. Only follow the
    // pointer when it actually moved, so a fresh result keeps the top
    // (most opened) bookmark selected.
    const last = lastPointerRef.current;
    if (last && last.x === e.screenX && last.y === e.screenY) return;

    lastPointerRef.current = { x: e.screenX, y: e.screenY };
    setActiveIndex(index);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Command toggles the number badges on the initial screen.
    if (e.key === "Meta") {
      if (!e.repeat && isInitialScreen && bookmarks.length > 0) {
        clearPendingDigit();
        setIndexMode((prev) => !prev);
      }
      return;
    }

    if (indexMode) {
      const digit = digitOf(e.code);
      if (digit !== null) {
        e.preventDefault();
        handleIndexDigit(digit);
        return;
      }
      // Any other key leaves number mode and behaves as usual.
      clearPendingDigit();
      setIndexMode(false);
      if (e.code === "Escape") {
        e.preventDefault();
        return;
      }
    }

    if (e.code === "ArrowDown") {
      setActiveIndex((prev) => {
        if (prev === bookmarks.length - 1) return prev;
        return prev + 1;
      });
    }

    if (e.code === "ArrowUp") {
      setActiveIndex((prev) => {
        if (prev === 0) return prev;
        return prev - 1;
      });
    }

    if (e.code === "Enter") {
      openBookmark(activeIndex);
    }
  };

  const searchBookmarks = (value: string, isComposing: boolean) => {
    const requestId = ++lastRequestIdRef.current;
    const payload: Payload = {
      action: ACTION_TYPE.GET_BOOKMARKS,
      data: value,
    };

    sendMessage(payload, (response) => {
      // Drop responses that arrive after a newer search was sent.
      if (requestId !== lastRequestIdRef.current) return;
      if (!response || !response.bookmarks) return;

      // While an IME is composing (e.g. "위" -> "윜" -> "위키"), the
      // intermediate syllable often matches nothing. Keep the previous
      // results instead of flashing "No bookmarks found".
      if (isComposing && response.bookmarks.length === 0) return;

      const limit =
        value.trim() === "" ? MAX_STARRED_COUNT : MAX_BOOKMARKS_COUNT;
      setBookmarks(response.bookmarks.slice(0, limit));
      setActiveIndex(0);
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearPendingDigit();
    setIndexMode(false);
    setKeyword(e.target.value);
    searchBookmarks(
      e.target.value,
      (e.nativeEvent as InputEvent).isComposing ?? false
    );
  };

  const handleCompositionEnd = (
    e: React.CompositionEvent<HTMLInputElement>
  ) => {
    // Search once more with the committed text so a result list kept
    // during composition is replaced by the real result.
    searchBookmarks(e.currentTarget.value, false);
  };

  useEffect(() => {
    inputRef.current?.focus();
    const introTimer = window.setTimeout(() => setIntro(false), INTRO_MS);
    // Load the starred bookmarks for the initial screen.
    searchBookmarks("", false);
    return () => {
      window.clearTimeout(introTimer);
      clearPendingDigit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-3 popup-enter" onKeyDown={handleKeyDown}>
      <InputGroup className="mb-3">
        <InputGroup.Text id="basic-addon1">
          <i className="bi bi-search" />
        </InputGroup.Text>
        <Form.Control
          ref={inputRef}
          placeholder="Bookmark Search"
          aria-label="Username"
          aria-describedby="basic-addon1"
          onChange={handleInputChange}
          onCompositionEnd={handleCompositionEnd}
          value={keyword}
        />
      </InputGroup>
      <ListGroup className={intro ? "bookmark-list intro" : "bookmark-list"}>
        {bookmarks.length === 0 && (
          <ListGroup.Item className="text-center">
            {isInitialScreen ? (
              <>
                <i className="bi bi-star me-2" />
                <span>Star a bookmark to pin it here</span>
              </>
            ) : (
              <>
                <i className="bi bi-x-lg me-2" />
                <span>No bookmarks found</span>
              </>
            )}
          </ListGroup.Item>
        )}
        {bookmarks.map((bookmark, index) => {
          const isActive = index === activeIndex;
          const isLaunching = index === launchingIndex;
          const favicon = faviconUrl(bookmark.url);
          return (
            <ListGroup.Item
              onMouseMove={(e) => handleMouseMove(e, index)}
              key={bookmark.id}
              active={isActive}
              className={[
                "d-flex align-items-center",
                isInitialScreen ? "py-2" : "",
                isLaunching ? "launching" : "",
              ].join(" ")}
              onClick={() => openBookmark(index)}
            >
              <span className="me-2 flex-shrink-0 lead-icon">
                {indexMode ? (
                  <span className="index-badge">{index + 1}</span>
                ) : isLaunching ? (
                  <i className="bi bi-box-arrow-up-right text-graident"></i>
                ) : favicon ? (
                  <img className="favicon" src={favicon} alt="" />
                ) : (
                  <i className="bi bi-bookmark"></i>
                )}
              </span>
              <div className="flex-grow-1 overflow-hidden">
                <div className="text-truncate">
                  <Highlight text={bookmark.title} keyword={keyword} />
                </div>
                {!isInitialScreen && (
                  <div className="text-truncate text-muted fs-7">
                    <Highlight text={bookmark.url ?? ""} keyword={keyword} />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="star-toggle"
                aria-label={bookmark.starred ? "Unstar" : "Star"}
                aria-pressed={!!bookmark.starred}
                onClick={(e) => toggleStar(e, bookmark)}
              >
                <i
                  className={
                    bookmark.starred ? "bi bi-star-fill starred" : "bi bi-star"
                  }
                />
              </button>
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </div>
  );
}

export default App;
