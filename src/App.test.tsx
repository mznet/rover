import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import App from "./App";

test("renders input component", () => {
  render(<App />);
  const inputElement = screen.getByPlaceholderText("Bookmark Search");
  expect(inputElement).toBeInTheDocument();
});

test("renders application's logo", () => {
  render(<App />);
  const imageElement = screen.getByAltText("rover logo");
  expect(imageElement).toBeInTheDocument();
});

test("renders bookmark list", () => {
  render(<App />);
  const listElement = screen.getByText("No bookmarks found");
  expect(listElement).toBeInTheDocument();
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
        sendMessage: jest.fn((_payload, callback) =>
          callback?.({ bookmarks: results })
        ),
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
