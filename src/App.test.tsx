import React from "react";
import { render, screen } from "@testing-library/react";

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
