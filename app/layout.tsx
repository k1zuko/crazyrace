import type { Metadata } from 'next';
import { headers } from "next/headers";
import ClientLayout from './ClientLayout';
import { Press_Start_2P } from 'next/font/google'
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const host = headers().get("host") || "crazyrace.gameforsmart.com";
  const protocol = host.includes("localhost") ? "http" : "https";
  const fullUrl = `${protocol}://${host}`;

  return {
    metadataBase: new URL(fullUrl),
    title: "Crazy Race",
    description: "Answer • Race • Win",
    manifest: "/manifest.json",
    openGraph: {
      title: "Crazy Race",
      description: "Answer • Race • Win",
      url: fullUrl,
      siteName: "Crazy Race",
      images: [
        {
          url: "/icons/icon-512x512.png",
          width: 512,
          height: 512,
          alt: "Crazy Race Logo",
        }
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Crazy Race",
      description: "Answer • Race • Win",
      images: ["/icons/icon-512x512.png"],
    },
  };
}


const pressStart = Press_Start_2P({
  subsets: ['latin'],
  weight: '400'
})


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/gameforsmart-logo.png" type="image/png" fetchPriority="high" />
        <link rel="preload" as="image" href="/crazyrace-logo.png" type="image/png" fetchPriority="high" />
        <link rel="preload" as="image" href="/crazyrace-logo-utama.png" type="image/png" fetchPriority="high" />
        <link rel="preload" as="image" href="/assets/background/1.webp" type="image/webp" fetchPriority="high" />
                <script
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "ujxpvifg7f");`,
          }}
        />
      </head>

      <body className={pressStart.className}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
