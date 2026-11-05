import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import App from "./App";
import ACTION_TYPE from "./enum/ActionType";

test("renders input component", () => {
  render(<App />);
  const inputElement = screen.getByPlaceholderText("Bookmark Search");
  expect(inputElement).toBeInTheDocument();
});

test("does not render a logo", () => {
  render(<App />);
  expect(screen.queryByAltText("rover logo")).not.toBeInTheDocument();
});

test("shows a star hint on an empty initial screen", () => {
  render(<App />);
  expect(
    screen.getByText("Star a bookmark to pin it here")
  ).toBeInTheDocument();
});

describe("with search results", () => {
  const results = [
    { id: "1", title: "Most opened", url: "https://a.example" },
    { id: "2", title: "Second", url: "https://b.example" },
    { id: "3", title: "Third", url: "https://c.example" },
  ];

  beforeEach(() => {
    (global as any).chrome = {
      runtime: {
        sendMessage: jest.fn((payload, callback) => {
          // The initial (empty) query returns no starred bookmarks.
          if (payload.action === ACTION_TYPE.GET_BOOKMARKS)
            callback?.({ bookmarks: payload.data ? results : [] });
        }),
      },
    };
  });

  afterEach(() => {
    delete (global as any).chrome;
  });

  const search = async () => {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("Bookmark Search"), {
      target: { value: "example" },
    });
    await screen.findByText("Most opened");
  };

  const activeTitle = () =>
    document.querySelector(".list-group-item.active")?.textContent;

  test("selects the top bookmark after a search", async () => {
    await search();
    expect(activeTitle()).toContain("Most opened");
  });

  test("ignores hover from a re-render under a resting pointer", async () => {
    await search();
    const third = screen.getByText("Third");
    fireEvent.mouseMove(third, { screenX: 10, screenY: 10 });
    expect(activeTitle()).toContain("Third");

    // New results arrive while the pointer stays put.
    fireEvent.change(screen.getByPlaceholderText("Bookmark Search"), {
      target: { value: "exampl" },
    });
    fireEvent.mouseMove(screen.getByText("Second"), {
      screenX: 10,
      screenY: 10,
    });
    expect(activeTitle()).toContain("Most opened");
  });

  test("follows the pointer when it actually moves", async () => {
    await search();
    fireEvent.mouseMove(screen.getByText("Second"), {
      screenX: 10,
      screenY: 20,
    });
    expect(activeTitle()).toContain("Second");
  });
});

describe("initial screen with starred bookmarks", () => {
  const starred = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1),
    title: `Starred ${i + 1}`,
    url: `https://s${i + 1}.example`,
    starred: true,
  }));
  let sendMessage: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    sendMessage = jest.fn((payload, callback) => {
      if (payload.action === ACTION_TYPE.GET_BOOKMARKS)
        callback?.({ bookmarks: starred });
      if (payload.action === ACTION_TYPE.TOGGLE_STAR)
        callback?.({ starred: false });
    });
    (global as any).chrome = { runtime: { sendMessage } };
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (global as any).chrome;
  });

  const openedIds = () =>
    sendMessage.mock.calls
      .filter(([p]) => p.action === ACTION_TYPE.OPEN_BOOKMARK)
      .map(([p]) => p.data);

  const input = () => screen.getByPlaceholderText("Bookmark Search");

  test("lists starred bookmarks in their given order", () => {
    render(<App />);
    const titles = Array.from(
      document.querySelectorAll(".list-group-item")
    ).map((el) => el.textContent);
    expect(titles[0]).toContain("Starred 1");
    expect(titles[11]).toContain("Starred 12");
  });

  test("Command shows numbers and a digit opens that bookmark", () => {
    render(<App />);
    fireEvent.keyDown(input(), { key: "Meta", code: "MetaLeft" });
    expect(document.querySelectorAll(".index-badge")).toHaveLength(12);

    fireEvent.keyDown(input(), { key: "3", code: "Digit3" });
    expect(document.querySelector(".launching")?.textContent).toContain(
      "Starred 3"
    );
    act(() => {
      jest.runAllTimers();
    });
    expect(openedIds()).toEqual(["3"]);
  });

  test("two digits open a bookmark past 9", () => {
    render(<App />);
    fireEvent.keyDown(input(), { key: "Meta", code: "MetaLeft" });
    fireEvent.keyDown(input(), { key: "1", code: "Digit1" });
    fireEvent.keyDown(input(), { key: "2", code: "Digit2" });
    act(() => {
      jest.runAllTimers();
    });
    expect(openedIds()).toEqual(["12"]);
  });

  test("a lone 1 opens the first bookmark after a pause", () => {
    render(<App />);
    fireEvent.keyDown(input(), { key: "Meta", code: "MetaLeft" });
    fireEvent.keyDown(input(), { key: "1", code: "Digit1" });
    act(() => {
      jest.runAllTimers();
    });
    expect(openedIds()).toEqual(["1"]);
  });

  test("unstarring on the initial screen keeps the row to star again", () => {
    render(<App />);
    fireEvent.click(screen.getAllByLabelText("Unstar")[0]);
    expect(screen.getByText("Starred 1")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Star")).toHaveLength(1);

    act(() => {
      jest.runAllTimers();
    });
    expect(openedIds()).toEqual([]);
  });
});
