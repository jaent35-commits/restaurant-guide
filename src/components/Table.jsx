import React from "react";

/**
 * columns: [{ key, header, align?, className?, sortable?, render?(row) }]
 *  - align: 셀(td) 정렬. 헤더(th)는 항상 중앙 정렬
 *  - className: th/td 공통 클래스 (예: "hidden lg:table-cell" 반응형 숨김)
 *  - sortable: true 면 헤더 클릭 시 onHeaderClick(key) 호출
 * rows: 데이터 배열 (row.id 필수)
 * onRowClick / rowClassName / minWidth(표 최소 너비, 좁으면 가로 스크롤) 선택
 */
export default function Table({
  columns,
  rows,
  onRowClick,
  rowClassName,
  emptyText = "데이터가 없습니다.",
  minWidth,
  onHeaderClick,
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-list-line-100 bg-gray-100">
      <table className="w-full border-collapse text-body2" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr className="bg-list-bg-200 text-center text-caption text-text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={c.sortable && onHeaderClick ? () => onHeaderClick(c.key) : undefined}
                className={`whitespace-nowrap px-token-4 py-token-3 font-bold ${
                  c.sortable && onHeaderClick ? "cursor-pointer select-none hover:text-primary-400" : ""
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
              <td colSpan={columns.length} className="px-token-4 py-token-6 text-center text-text-muted">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-t border-list-line-100 ${
                onRowClick ? "cursor-pointer hover:bg-primary-100" : ""
              } ${rowClassName ? rowClassName(row) : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
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
