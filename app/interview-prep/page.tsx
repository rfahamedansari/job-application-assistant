import { Suspense } from "react";

import InterviewPrepClient from "./InterviewPrepClient";

export default function InterviewPrepPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading interview preparation...</div>}>
      <InterviewPrepClient />
    </Suspense>
  );
}
