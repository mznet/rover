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

test("shows a tag hint on an empty initial screen", () => {
  render(<App />);
  expect(screen.getByText("Tag a bookmark to see it here")).toBeInTheDocument();
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
          // The initial (empty) query returns no tagged bookmarks.
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

  test("shows no results for an uncommitted syllable after a wait", async () => {
    await search();
    jest.useFakeTimers();
    try {
      // "대" matches nothing; jsdom has no isComposing, so mark it.
      const event = new Event("input", { bubbles: true });
      Object.defineProperty(event, "isComposing", { value: true });
      const input = screen.getByPlaceholderText(
        "Bookmark Search"
      ) as HTMLInputElement;
      (global as any).chrome.runtime.sendMessage.mockImplementation(
        (_: unknown, callback: any) => callback?.({ bookmarks: [] })
      );
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      setValue.call(input, "대");
      fireEvent(input, event);

      // Kept during the wait, so an intermediate syllable does not flash.
      expect(screen.getByText("Most opened")).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(screen.getByText("No bookmarks found")).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
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

describe("initial screen with tagged bookmarks", () => {
  const tagged = Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1),
    title: `Tagged ${i + 1}`,
    url: `https://s${i + 1}.example`,
    tags: ["work"],
  }));
  let sendMessage: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    sendMessage = jest.fn((payload, callback) => {
      if (payload.action === ACTION_TYPE.GET_BOOKMARKS)
        callback?.({ bookmarks: tagged, tags: ["work"], tag: "work" });
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

  test("opens on the first tag's bookmarks in their given order", () => {
    render(<App />);
    const titles = Array.from(
      document.querySelectorAll(".list-group-item")
    ).map((el) => el.textContent);
    expect(titles[0]).toContain("Tagged 1");
    expect(titles[11]).toContain("Tagged 12");
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(
      "#work"
    );
  });

  test("Command shows numbers and a digit opens that bookmark", () => {
    render(<App />);
    fireEvent.keyDown(input(), { key: "Meta", code: "MetaLeft" });
    expect(document.querySelectorAll(".index-badge")).toHaveLength(12);

    fireEvent.keyDown(input(), { key: "3", code: "Digit3" });
    expect(document.querySelector(".launching")?.textContent).toContain(
      "Tagged 3"
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

});

describe("tags", () => {
  const home = [
    { id: "1", title: "Home one", url: "https://a.example", tags: ["home"] },
  ];
  const work = [
    { id: "2", title: "Work one", url: "https://w.example", tags: ["work"] },
  ];
  let sendMessage: jest.Mock;

  beforeEach(() => {
    sendMessage = jest.fn((payload, callback) => {
      if (payload.action === ACTION_TYPE.GET_BOOKMARKS)
        callback?.({
          bookmarks: payload.tag === "work" ? work : home,
          tags: ["home", "work"],
          tag: payload.tag ?? "home",
        });
      if (payload.action === ACTION_TYPE.SET_TAGS)
        callback?.({ tags: ["fun", "home"] });
    });
    (global as any).chrome = { runtime: { sendMessage } };
  });

  afterEach(() => {
    delete (global as any).chrome;
  });

  const input = () => screen.getByPlaceholderText("Bookmark Search");

  test("arrow keys switch to a tag tab and back", () => {
    render(<App />);
    expect(screen.getByText("Home one")).toBeInTheDocument();

    fireEvent.keyDown(input(), { key: "ArrowRight", code: "ArrowRight" });
    expect(screen.getByText("Work one")).toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(
      "#work"
    );

    fireEvent.keyDown(input(), { key: "ArrowLeft", code: "ArrowLeft" });
    expect(screen.getByText("Home one")).toBeInTheDocument();
  });

  test("saves tags typed in the row editor", () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText("Edit tags"));
    const editor = screen.getByLabelText("Tags");
    fireEvent.change(editor, { target: { value: "home, fun" } });
    fireEvent.keyDown(editor, { key: "Enter", code: "Enter" });

    const call = sendMessage.mock.calls.find(
      ([p]) => p.action === ACTION_TYPE.SET_TAGS
    );
    expect(call?.[0]).toMatchObject({ data: "1", tags: ["home", " fun"] });
    // Enter saved instead of opening the bookmark.
    expect(document.querySelector(".launching")).toBeNull();
    expect(screen.getByRole("tab", { name: "#fun" })).toBeInTheDocument();
  });
});
