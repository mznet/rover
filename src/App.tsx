import React, { useEffect, useRef, useState } from "react";
import { InputGroup, ListGroup } from "react-bootstrap";
import Form from "react-bootstrap/Form";
import Bookmark from "./interface/Bookmark";
import ACTION_TYPE from "./enum/ActionType";
import Payload from "./interface/Payload";

function App() {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [keyword, setKeyword] = useState<string>("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const inputRef = useRef<HTMLInputElement>(null); //ts

  const handleBookmarkClick = (url?: string) => {
    if (!url) return;
    window.open(url);
  };

  const handleMouseOver = (index: number) => {
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
      if (bookmarks[activeIndex]?.url) {
        if (bookmarks[activeIndex].url) {
          window.open(bookmarks[activeIndex].url);
        }
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value);

    const payload: Payload = {
      action: ACTION_TYPE.GET_BOOKMARKS,
      data: e.target.value,
    };

    chrome.runtime.sendMessage(payload, (response) => {
      if (response && response.bookmarks) {
        setBookmarks(response.bookmarks.slice(0, 8));
      }
    });
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="p-3" onKeyDown={handleKeyDown}>
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
              onMouseOver={() => handleMouseOver(index)}
              key={index}
              active={index === activeIndex}
              onClick={() => handleBookmarkClick(bookmark.url)}
            >
              <div className="text-truncate">
                <i className="bi bi-bookmark me-2"></i>
                <span>{bookmark.title}</span>
              </div>
              <div className="text-truncate text-muted fs-7">
                {bookmark.url}
              </div>
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </div>
  );
}

export default App;
