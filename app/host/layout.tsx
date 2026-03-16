import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Host | Crazy Race",
};

export default function HostLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
