import React, { useState } from "react";
import { useStore } from "../store";
import { Badge, Button, Input, Modal, useToast } from "../components";
import VWorldMap from "../components/VWorldMap";
import { formatKRW, restaurantIcon, depositStatus } from "../utils";
import { useTowerGeo } from "../geo";
import { VWORLD_KEY_STORAGE, VWORLD_DOMAIN_STORAGE } from "../vworldSdk";

/** 지도 설정 모달 — 브이월드(VWorld) 인증키 · 등록 도메인 등록/삭제 */
function MapSettingsModal({ open, onClose, vworldKey, vworldDomain, onSave, onRemove }) {
  const [key, setKey] = useState("");
  const [domain, setDomain] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="지도 설정"
      footer={<Button variant="secondary" onClick={onClose}>닫기</Button>}
    >
      <div className="flex flex-col gap-token-4 text-body2">
        <p className="text-text">
          지도는 <b>브이월드(VWorld)</b> 2D 지도 API 2.0을 사용합니다. 국토교통부
          국가공간정보포털(www.vworld.kr)에서 인증키를 발급받아 등록해야 지도와 식당 주소 →
          좌표 변환이 정상 동작합니다.
        </p>
        <ol className="list-decimal pl-token-5 text-caption text-text-muted">
          <li>www.vworld.kr → 회원가입 후 오픈API → 인증키 신청</li>
          <li>인증키 관리에서 <b>사용 도메인</b>에 접속 주소 등록 (예: http://localhost:5174)</li>
          <li>발급된 <b>인증키</b>와 등록한 <b>도메인</b>을 아래에 입력</li>
        </ol>

        {vworldKey ? (
          <div className="flex items-center justify-between rounded-md bg-surface px-token-4 py-token-3">
            <div className="min-w-0">
              <p className="truncate text-text">
                인증키 등록됨 <span className="text-text-muted">({vworldKey.slice(0, 6)}…)</span>
              </p>
              <p className="truncate text-caption text-text-muted">도메인: {vworldDomain || "-"}</p>
            </div>
            <Button variant="danger" size="sm" onClick={onRemove}>
              등록 삭제
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-token-2">
            <Input
              label="브이월드 인증키"
              placeholder="예: 1A2B3C4D-..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <Input
              label="등록 도메인"
              placeholder="예: http://localhost:5174"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
            <Button
              className="self-end"
              onClick={() => {
                if (!key.trim() || !domain.trim()) return;
                onSave(key.trim(), domain.trim());
                setKey("");
                setDomain("");
              }}
            >
              저장
            </Button>
          </div>
        )}
        <p className="text-caption text-text-muted">* 인증키 · 도메인은 이 브라우저에만 저장됩니다.</p>
      </div>
    </Modal>
  );
}

export default function HomePage({ goDetail }) {
  const { restaurantsWithBalance } = useStore();
  const toast = useToast();
  const [vworldKey, setVworldKey] = useState(
    () => localStorage.getItem(VWORLD_KEY_STORAGE) || import.meta.env.VITE_VWORLD_KEY || ""
  );
  const [vworldDomain, setVworldDomain] = useState(
    () => localStorage.getItem(VWORLD_DOMAIN_STORAGE) || import.meta.env.VITE_VWORLD_DOMAIN || ""
  );
  const [mapError, setMapError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tower = useTowerGeo(); // 대교타워 실좌표 — 초기값은 근사값, 지오코딩 완료 시 자동 갱신

  // 예치금 0원 → 홈에서 가리기, 예치금 많은 순 정렬
  const visible = restaurantsWithBalance()
    .filter((r) => r.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const saveConfig = (key, domain) => {
    localStorage.setItem(VWORLD_KEY_STORAGE, key);
    localStorage.setItem(VWORLD_DOMAIN_STORAGE, domain);
    setMapError(false);
    setVworldKey(key);
    setVworldDomain(domain);
    setSettingsOpen(false);
    toast("브이월드 지도 설정이 저장되었습니다.");
  };
  const removeConfig = () => {
    localStorage.removeItem(VWORLD_KEY_STORAGE);
    localStorage.removeItem(VWORLD_DOMAIN_STORAGE);
    setVworldKey("");
    setVworldDomain("");
    setMapError(false);
    setSettingsOpen(false);
    toast("브이월드 지도 설정을 삭제했습니다.", "info");
  };

  return (
    <div className="grid gap-token-4 lg:grid-cols-[1fr_360px]">
      <section className="flex min-h-[420px] flex-col gap-token-2">
        <div className="h-[520px] w-full">
          <VWorldMap
            restaurants={visible}
            onSelect={goDetail}
            tower={tower}
            vworldKey={vworldKey}
            vworldDomain={vworldDomain}
            onError={() => {
              setMapError(true);
              toast("브이월드 지도를 불러오지 못했습니다. 인증키/도메인을 확인해 주세요.", "error");
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-caption text-text-muted">
            브이월드(VWorld) · 대교타워 기준 실좌표 표시
            {mapError && " · 로드 실패"}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            지도 설정
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-token-3">
        <h2 className="text-header font-bold text-text">
          등록 식당 <span className="text-text-muted">({visible.length})</span>
        </h2>
        <ul className="flex flex-col gap-token-2">
          {visible.map((r) => {
            const status = depositStatus(r.balance);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => goDetail(r.id)}
                  className="flex w-full items-center gap-token-3 rounded-lg border border-list-line-100 bg-gray-100 p-token-3 text-left hover:border-primary-300"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-header">
                    {restaurantIcon(r)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-token-2">
                      <span className="truncate text-body2 font-bold text-text">{r.name}</span>
                      {status.key === "credit" && <Badge tone="credit">외상</Badge>}
                    </span>
                    <span className="block truncate text-caption text-text-muted">{r.mainMenu}</span>
                  </span>
                  <span
                    className={`shrink-0 text-body2 font-bold ${
                      r.balance < 0 ? "text-danger" : "text-primary-400"
                    }`}
                  >
                    {formatKRW(r.balance)}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="rounded-lg border border-list-line-100 bg-gray-100 p-token-4 text-center text-body2 text-text-muted">
              표시할 식당이 없습니다. 예치금을 충전해 주세요.
            </li>
          )}
        </ul>
      </section>

      <MapSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        vworldKey={vworldKey}
        vworldDomain={vworldDomain}
        onSave={saveConfig}
        onRemove={removeConfig}
      />
    </div>
  );
}
