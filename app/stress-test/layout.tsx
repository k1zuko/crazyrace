import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Stress Test | Crazy Race",
};

export default function StressTestLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
