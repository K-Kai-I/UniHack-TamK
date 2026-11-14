"use client";
// Trang thử camera: /dev/camera. Mở trên điện thoại thật (cần HTTPS hoặc localhost) để kiểm tra chụp ảnh.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CameraCapture, type CapturedPhoto } from "@/components/camera-capture";

export default function DevCameraPage() {
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [env, setEnv] = useState("");

  useEffect(() => {
    setEnv(
      `secure=${window.isSecureContext} · getUserMedia=${!!navigator.mediaDevices?.getUserMedia} · ${location.origin}`,
    );
  }, []);

  useEffect(() => {
    if (!photo) return setUrl(null);
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  return (
    <main className="mx-auto max-w-md space-y-4 px-5 py-6">
      <h1 className="text-2xl font-extrabold text-primary">Thử camera</h1>
      <p className="font-mono text-xs break-all text-muted-foreground">{env}</p>

      {!photo ? (
        <CameraCapture onCapture={setPhoto} />
      ) : (
        <Card>
          <CardContent className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url && <img src={url} alt="Ảnh vừa chụp" className="w-full rounded-xl" />}
            <ul className="space-y-0.5 text-sm">
              <li>Nguồn: <b>{photo.source}</b></li>
              <li>Kích thước: <b>{photo.width}×{photo.height}</b>, {(photo.blob.size / 1024).toFixed(0)} KB</li>
              <li>Lúc chụp: <span className="font-mono">{photo.capturedAt}</span></li>
            </ul>
            <Button size="lg" className="w-full" onClick={() => setPhoto(null)}>
              Chụp lại
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
