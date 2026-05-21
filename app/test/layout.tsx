import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Test | Crazy Race",
};

export default function TestLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
