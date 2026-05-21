import { Suspense } from "react";
import HomePage from "./HomePage";
import LoadingRetro from "@/components/loadingRetro";

export default function Home() {
    return (
        <Suspense fallback={<LoadingRetro />}>
            <HomePage />
        </Suspense>
    )
}