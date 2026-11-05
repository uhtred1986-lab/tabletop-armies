"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { Dialog } from "./Dialog";

export function DialogSpecimen() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn secondary w-btn" onClick={() => setOpen(true)}>{t("kit.openDialog")}</button>
    <Dialog open={open} title={t("kit.dialog")} onClose={() => setOpen(false)} footer={<button type="button" className="btn secondary w-btn" onClick={() => setOpen(false)}>{t("action.cancel")}</button>}>
      <p>{t("kit.dialogBody")}</p>
    </Dialog></>;
}
