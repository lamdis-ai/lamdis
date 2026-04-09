"use client";
import { useState } from 'react';
import Button from '@/components/base/Button';
import CreateSuiteModal from '@/components/suites/CreateSuiteModal';

export default function CreateSuiteLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={()=>setOpen(true)}>Create Suite</Button>
      <CreateSuiteModal open={open} onClose={()=>setOpen(false)} />
    </>
  );
}
