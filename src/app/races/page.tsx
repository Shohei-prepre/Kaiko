import { Suspense } from "react";
import RacesClient from "./RacesClient";

export default function RacesPage() {
  return (
    <Suspense>
      <RacesClient />
    </Suspense>
  );
}
