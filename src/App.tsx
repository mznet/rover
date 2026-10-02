import React, { useEffect, useRef, useState } from "react";
import { InputGroup, ListGroup } from "react-bootstrap";
import Form from "react-bootstrap/Form";
import Bookmark from "./interface/Bookmark";
import ACTION_TYPE from "./enum/ActionType";
import Payload from "./interface/Payload";
import Highlight from "./component/Highlight";

const MAX_BOOKMARKS_COUNT = 8;

function App() {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [keyword, setKeyword] = useState<string>("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const inputRef = useRef<HTMLInputElement>(null); //ts
  const lastRequestIdRef = useRef<number>(0);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const openBookmark = (bookmark?: Bookmark) => {
    if (!bookmark?.url) return;

    const payload: Payload = {
      action: ACTION_TYPE.OPEN_BOOKMARK,
      data: bookmark.id,
    };

    chrome.runtime.sendMessage(payload);
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
      openBookmark(bookmarks[activeIndex]);
    }
  };

  const searchBookmarks = (value: string, isComposing: boolean) => {
    const requestId = ++lastRequestIdRef.current;
    const payload: Payload = {
      action: ACTION_TYPE.GET_BOOKMARKS,
      data: value,
    };

    chrome.runtime.sendMessage(payload, (response) => {
      // Drop responses that arrive after a newer search was sent.
      if (requestId !== lastRequestIdRef.current) return;
      if (!response || !response.bookmarks) return;

      // While an IME is composing (e.g. "위" -> "윜" -> "위키"), the
      // intermediate syllable often matches nothing. Keep the previous
      // results instead of flashing "No bookmarks found".
      if (isComposing && response.bookmarks.length === 0) return;

      setBookmarks(response.bookmarks.slice(0, MAX_BOOKMARKS_COUNT));
      setActiveIndex(0);
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, []);

  return (
    <div className="p-3" onKeyDown={handleKeyDown}>
      {bookmarks.length === 0 && (
        <div className="mb-3 text-center">
          <img src="./icon.png" style={{ height: "36px" }} alt="rover logo" />
        </div>
      )}
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
      <ListGroup>
        {bookmarks.length === 0 && (
          <ListGroup.Item className="text-center">
            <i className="bi bi-x-lg me-2" />
            <span>No bookmarks found</span>
          </ListGroup.Item>
        )}
        {bookmarks.map((bookmark, index) => {
          return (
            <ListGroup.Item
              onMouseMove={(e) => handleMouseMove(e, index)}
              key={index}
              active={index === activeIndex}
              onClick={() => openBookmark(bookmark)}
            >
              <div className="text-truncate">
                <span className="me-2 ">
                  {index === activeIndex ? (
                    <i className="bi bi-bookmark-fill text-graident"></i>
                  ) : (
                    <i className="bi bi-bookmark"></i>
                  )}
                </span>
                <span>
                  <Highlight text={bookmark.title} keyword={keyword} />
                </span>
              </div>
              <div className="text-truncate text-muted fs-7">
                <Highlight text={bookmark.url ?? ""} keyword={keyword} />
              </div>
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </div>
  );
}

export default App;
