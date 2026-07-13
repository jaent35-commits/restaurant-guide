import React, { useRef } from "react";
import Field from "./Field";
import Button from "./Button";

/** 이미지 증빙 업로드 — 파일을 dataURL 로 읽어 value(onChange)로 전달, 미리보기 제공 */
export default function FileInput({ label, required, error, value, onChange, className = "" }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange?.(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <Field label={label} required={required} error={error} className={className}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div
        className={`flex items-center gap-token-3 rounded-md border border-dashed p-token-3 ${
          error ? "border-danger" : "border-list-line-200"
        }`}
      >
        {value ? (
          <img
            src={value}
            alt="증빙 미리보기"
            className="h-16 w-16 rounded-sm border border-border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-sm bg-surface text-title text-icon-100">
            🧾
          </div>
        )}
        <div className="flex flex-col gap-token-1">
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            이미지 선택
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange?.(null)}>
              삭제
            </Button>
          )}
        </div>
      </div>
      <p className="mt-token-1 text-caption text-text-muted">
        ※ 이 이미지는 서버에 저장되지 않으며, 올린 사람의 기기(갤러리)에만 보관되어 표시됩니다.
      </p>
    </Field>
  );
}
