import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, getCurrentTheme, setTheme } from "@/lib/theme";

const html = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html().removeAttribute("data-theme");
});

function runInitScript() {
  new Function(THEME_INIT_SCRIPT)();
}

describe("theme init script (runs before first paint)", () => {
  it("defaults to dark when nothing is stored", () => {
    runInitScript();
    expect(html().getAttribute("data-theme")).toBe("dark");
  });

  it("applies a stored light theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runInitScript();
    expect(html().getAttribute("data-theme")).toBe("light");
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    runInitScript();
    expect(html().getAttribute("data-theme")).toBe("dark");
  });
});

describe("setTheme", () => {
  it("applies and persists without reloading", () => {
    setTheme("light");
    expect(getCurrentTheme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

describe("ThemeToggle", () => {
  it("reflects the active theme with aria-pressed and switches on click", () => {
    runInitScript();
    render(<ThemeToggle />);
    const dark = screen.getByRole("button", { name: "Dark theme" });
    const light = screen.getByRole("button", { name: "Light theme" });
    expect(dark).toHaveAttribute("aria-pressed", "true");
    expect(light).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(light);
    expect(html().getAttribute("data-theme")).toBe("light");
    expect(light).toHaveAttribute("aria-pressed", "true");
    expect(dark).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    fireEvent.click(dark);
    expect(html().getAttribute("data-theme")).toBe("dark");
  });

  it("picks up a theme restored from storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    runInitScript();
    render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Light theme" })).toHaveAttribute("aria-pressed", "true");
  });
});
