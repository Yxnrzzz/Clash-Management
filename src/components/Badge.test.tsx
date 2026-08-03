import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverdueBadge, PriorityBadge, StatusBadge } from "./Badge";
import type { Priority, Status } from "@/lib/types";

describe("StatusBadge", () => {
  it("renders the status name", () => {
    const status: Status = { id: "s1", nama: "In Progress", urutan: 1, isClosedState: false };
    render(<StatusBadge status={status} />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders nothing when status is undefined", () => {
    const { container } = render(<StatusBadge status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PriorityBadge", () => {
  it("renders the priority name", () => {
    const priority: Priority = { id: "p1", nama: "Critical", bobot: 4, isActive: true };
    render(<PriorityBadge priority={priority} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("renders nothing when priority is undefined", () => {
    const { container } = render(<PriorityBadge priority={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("OverdueBadge", () => {
  it("renders the overdue label", () => {
    render(<OverdueBadge />);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });
});
