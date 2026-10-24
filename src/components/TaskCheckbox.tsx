"use client";

import { useState } from "react";
import { updateTask } from "@/app/actions";

export function TaskCheckbox({ taskId, done }: { taskId: string; done: boolean }) {
  const [checked, setChecked] = useState(done);
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={async () => {
        setChecked(!checked);
        await updateTask(taskId, { done: !checked });
      }}
      className="h-4 w-4 accent-[#6f8a4a]"
    />
  );
}
