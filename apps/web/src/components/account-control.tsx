"use client";

import { UserButton } from "@clerk/nextjs";

export function AccountControl() {
  return (
    <div className="accountControl">
      <span>Engineering workspace</span>
      <UserButton />
    </div>
  );
}
