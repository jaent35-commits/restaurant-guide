import React, { useRef, useState } from "react";

/**
 * columns: [{ key, header, align?, className?, sortable?, render?(row) }]
 *  - align: 셀(td) 정렬. 헤더(th)는 항상 중앙 정렬
 *  - className: th/td 공통 클래스 (예: "hidden lg:table-cell" 반응형 숨김)
 *  - sortable: true 면 헤더 클릭 시 onHeaderClick(key) 호출
 * rows: 데이터 배열 (row.id 필수)
 * onRowClick / rowClassName / minWidth(표 최소 너비, 좁으면 가로 스크롤) 선택
 * onRowLongPress: 행을 longPressMs(기본 2000ms) 동안 꾹 누르면 호출.
 *   누르는 동안 행이 하이라이트되고, 손가락/포인터가 움직이면(스크롤 등) 취소된다.
 */
export default function Table({
  columns,
  rows,
  onRowClick,
  rowClassName,
  emptyText = "데이터가 없습니다.",
  minWidth,
  onHeaderClick,
  onRowLongPress,
  longPressMs = 2000,
}) {
  const [pressedId, setPressedId] = useState(null);
  const timerRef = useRef(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false); // 롱프레스 발동 직후 click 무시용

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressedId(null);
  };

  const pressHandlers = (row) =>
    onRowLongPress
      ? {
          onPointerDown: (e) => {
            if (e.button > 0) return; // 우클릭 등 제외
            cancelPress();
            firedRef.current = false;
            startPosRef.current = { x: e.clientX, y: e.clientY };
            setPressedId(row.id);
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              firedRef.current = true;
              setPressedId(null);
              if (navigator.vibrate) navigator.vibrate(30); // 모바일 햅틱 피드백
              onRowLongPress(row);
            }, longPressMs);
          },
          onPointerMove: (e) => {
            // 10px 이상 움직이면(스크롤 의도) 취소
            const dx = e.clientX - startPosRef.current.x;
            const dy = e.clientY - startPosRef.current.y;
            if (timerRef.current && Math.hypot(dx, dy) > 10) cancelPress();
          },
          onPointerUp: cancelPress,
          onPointerLeave: cancelPress,
          onPointerCancel: cancelPress,
          // 모바일 길게 누르기 시 브라우저 컨텍스트 메뉴/텍스트 선택 방지
          onContextMenu: (e) => e.preventDefault(),
        }
      : {};

  const handleRowClick = (row) => {
    if (firedRef.current) {
      // 롱프레스가 이미 발동된 프레스의 click 은 무시
      firedRef.current = false;
      return;
    }
    onRowClick?.(row);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-list-line-100 bg-gray-100">
      <table
        className="w-full border-collapse text-body2"
        style={minWidth ? { minWidth } : undefined}
      >
        <thead>
          <tr className="bg-list-bg-200 text-center text-caption text-text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={c.sortable && onHeaderClick ? () => onHeaderClick(c.key) : undefined}
                className={`whitespace-nowrap px-token-4 py-token-3 font-bold ${
                  c.sortable && onHeaderClick
                    ? "cursor-pointer select-none hover:text-primary-400"
                    : ""
                } ${c.className ?? ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-token-4 py-token-6 text-center text-text-muted"
              >
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-t border-list-line-100 ${
                onRowClick ? "cursor-pointer hover:bg-primary-100" : ""
              } ${onRowLongPress ? "select-none" : ""} ${
                pressedId === row.id ? "bg-primary-100 transition-colors duration-1000" : ""
              } ${rowClassName ? rowClassName(row) : ""}`}
              onClick={onRowClick || onRowLongPress ? () => handleRowClick(row) : undefined}
              {...pressHandlers(row)}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-token-4 py-token-3 align-middle ${c.className ?? ""}`}
                  style={c.align ? { textAlign: c.align } : undefined}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
