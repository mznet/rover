import React, { useEffect, useRef, useState } from "react";
import { InputGroup, ListGroup } from "react-bootstrap";
import Form from "react-bootstrap/Form";
import Bookmark from "./interface/Bookmark";
import ACTION_TYPE from "./enum/ActionType";
import Payload from "./interface/Payload";
import Highlight from "./component/Highlight";

const MAX_BOOKMARKS_COUNT = 8;
const MAX_TAGGED_COUNT = 15;
// How long the "opening" effect plays before the new tab steals focus
// and closes the popup.
const LAUNCH_DELAY_MS = 250;
// Rows that render within this window after opening play the intro.
const INTRO_MS = 600;
// How long to wait for a second digit after "1" when 10+ items exist.
const SECOND_DIGIT_WAIT_MS = 600;
// How long an empty result during IME composition waits before showing.
const COMPOSING_EMPTY_DELAY_MS = 300;

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
  // Initial screen tabs, one per tag. null until the first load picks one.
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null); //ts
  const lastRequestIdRef = useRef<number>(0);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Set by the keyboard so only keyboard selection scrolls the list;
  // hovering a half visible row should not move it under the pointer.
  const followSelectionRef = useRef<boolean>(false);
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

  const selectTag = (tag: string | null) => {
    clearPendingDigit();
    setIndexMode(false);
    setActiveTag(tag);
    searchBookmarks("", false, tag);
  };

  const closeTagEditor = () => {
    setEditingTagsId(null);
    inputRef.current?.focus();
  };

  const saveTags = (bookmark: Bookmark, text: string) => {
    const payload: Payload = {
      action: ACTION_TYPE.SET_TAGS,
      data: bookmark.id,
      tags: text.split(","),
    };
    sendMessage(payload, (response) => {
      if (!response) return;
      const tags: string[] = response.tags;
      // The row stays even if it loses the open tab's tag, and tabs are
      // only added, so a tab never vanishes while open.
      setBookmarks((prev) =>
        prev.map((b) => (b.id === bookmark.id ? { ...b, tags } : b))
      );
      setTagNames((prev) =>
        Array.from(new Set([...prev, ...tags])).sort((a, b) =>
          a.localeCompare(b)
        )
      );
    });
    closeTagEditor();
  };

  const handleTagEditorKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    bookmark: Bookmark
  ) => {
    // Keep popup shortcuts (arrows, numbers, Enter to open) out of it.
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    if (e.code === "Enter") {
      e.preventDefault();
      saveTags(bookmark, e.currentTarget.value);
    }
    if (e.code === "Escape") {
      e.preventDefault();
      closeTagEditor();
    }
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
    followSelectionRef.current = false;
    setActiveIndex(index);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    followSelectionRef.current = true;

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

    // Left/Right switches tabs on the initial screen; the input is
    // empty there, so the caret has nowhere to go anyway.
    if (
      isInitialScreen &&
      tagNames.length > 0 &&
      (e.code === "ArrowLeft" || e.code === "ArrowRight")
    ) {
      e.preventDefault();
      const current = Math.max(tagNames.indexOf(activeTag ?? ""), 0);
      const next = current + (e.code === "ArrowLeft" ? -1 : 1);
      if (next >= 0 && next < tagNames.length) selectTag(tagNames[next]);
      return;
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

  const searchBookmarks = (
    value: string,
    isComposing: boolean,
    tag: string | null = activeTag
  ) => {
    const requestId = ++lastRequestIdRef.current;
    const payload: Payload = {
      action: ACTION_TYPE.GET_BOOKMARKS,
      data: value,
      ...(tag !== null && { tag }),
    };

    sendMessage(payload, (response) => {
      // Drop responses that arrive after a newer search was sent.
      if (requestId !== lastRequestIdRef.current) return;
      if (!response || !response.bookmarks) return;
      if (response.tags) setTagNames(response.tags);
      // Initial screen responses say which tag they listed.
      if ("tag" in response) setActiveTag(response.tag);

      // While an IME is composing (e.g. "위" -> "윜" -> "위키"), the
      // intermediate syllable often matches nothing. Wait briefly before
      // showing "No bookmarks found"; the next keystroke cancels it. A
      // syllable left uncommitted ("대") still shows it after the wait.
      if (isComposing && response.bookmarks.length === 0) {
        window.setTimeout(() => {
          if (requestId !== lastRequestIdRef.current) return;
          setBookmarks([]);
          setActiveIndex(0);
        }, COMPOSING_EMPTY_DELAY_MS);
        return;
      }

      const limit =
        value.trim() === "" ? MAX_TAGGED_COUNT : MAX_BOOKMARKS_COUNT;
      setBookmarks(response.bookmarks.slice(0, limit));
      // New results start at the top row, so show the top of the list.
      if (listRef.current) listRef.current.scrollTop = 0;
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

  // Keep the keyboard selected row inside the list's visible area.
  // The list has scroll-behavior: smooth, so these jumps animate.
  useEffect(() => {
    if (!followSelectionRef.current) return;
    followSelectionRef.current = false;

    const list = listRef.current;
    const item = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !item) return;

    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    if (itemBox.top < listBox.top) {
      list.scrollTop += itemBox.top - listBox.top;
    } else if (itemBox.bottom > listBox.bottom) {
      list.scrollTop += itemBox.bottom - listBox.bottom;
    }
  }, [activeIndex, bookmarks]);

  useEffect(() => {
    inputRef.current?.focus();
    const introTimer = window.setTimeout(() => setIntro(false), INTRO_MS);
    // Load the first tag's bookmarks for the initial screen.
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
      {isInitialScreen && tagNames.length > 0 && (
        <div className="tag-tabs mb-2" role="tablist">
          {tagNames.map((tag) => (
            <button
              key={tag}
              type="button"
              role="tab"
              aria-selected={tag === activeTag}
              className={tag === activeTag ? "active" : ""}
              // Keep focus in the search input so typing still searches.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectTag(tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      <ListGroup
        ref={listRef}
        className={intro ? "bookmark-list intro" : "bookmark-list"}
      >
        {bookmarks.length === 0 && (
          <ListGroup.Item className="text-center">
            {isInitialScreen && activeTag !== null ? (
              <>
                <i className="bi bi-tag me-2" />
                <span>No bookmarks tagged #{activeTag}</span>
              </>
            ) : isInitialScreen ? (
              <>
                <i className="bi bi-tag me-2" />
                <span>Tag a bookmark to see it here</span>
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
          const isEditingTags = bookmark.id === editingTagsId;
          const tags = bookmark.tags ?? [];
          return (
            <ListGroup.Item
              onMouseMove={(e) => handleMouseMove(e, index)}
              key={bookmark.id}
              active={isActive}
              className={[
                "d-flex align-items-center",
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
                  <img
                    className="favicon"
                    src={favicon}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <i className="bi bi-bookmark"></i>
                )}
              </span>
              <div className="flex-grow-1 overflow-hidden">
                <div className="text-truncate">
                  <Highlight text={bookmark.title} keyword={keyword} />
                  {tags.map((tag) => (
                    <span key={tag} className="tag-chip ms-1">
                      #{tag}
                    </span>
                  ))}
                </div>
                {isEditingTags ? (
                  <input
                    className="tag-editor fs-7"
                    autoFocus
                    defaultValue={tags.join(", ")}
                    placeholder="Tags, separated by commas"
                    aria-label="Tags"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => handleTagEditorKeyDown(e, bookmark)}
                    onBlur={closeTagEditor}
                  />
                ) : (
                  <div className="text-truncate text-muted fs-7">
                    <Highlight text={bookmark.url ?? ""} keyword={keyword} />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="row-toggle tag-toggle"
                aria-label="Edit tags"
                // Keep focus off the button so the editor's blur does not
                // fire first and reopen it.
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTagsId(isEditingTags ? null : bookmark.id);
                }}
              >
                <i className={tags.length ? "bi bi-tag-fill" : "bi bi-tag"} />
              </button>
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </div>
  );
}

export default App;
