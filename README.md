# ShiftWallet v5.0.3 — Final

ShiftWallet v4.11までの見た目・操作・既存データを維持しつつ、今後の機能追加で壊れにくい内部構造へ整理したv5.0.3最終版です。

## v5.0.3で整備した土台
- CSSデザイントークン（色・余白・角丸・タップ領域・最大幅）
- 共通フォーム / モーダル / UI API
- `100dvh` とiPhone safe-area対応
- 主要タップ領域44px以上
- `DataStore` と `schemaVersion: 5` によるデータ移行
- 安定した勤務先ID / プリセットID / 色番号
- `PayrollEngine` への給与計算ロジック集約
- プリセットと実シフトの分離、シフト追加時の時給・時間・休憩スナップショット保存
- 勤務先をベース色、同じ勤務先のプリセットを同系色の濃淡で表示

## 第2段階で追加した仕上げ
- ホームの勤務先別月収内訳をタップで展開 / 折りたたみ
- 固定費内訳も折りたたみ
- 目標達成までのプリセット候補は3件まで表示し、それ以上は展開式
- カレンダーは1日最大2シフト + `+N` に固定し、情報を詰め込みすぎない
- シフト / 固定費 / プリセット / 勤務先の削除後に5秒間「元に戻す」
- 開発用テストデータ生成と元データ復元
- 1日4シフト、長い勤務先名、日またぎ、月またぎ、2月29日などの回帰テストデータ
- 主要画面の横方向の見切れを確認するレイアウト診断

## 更新方法
GitHub Pagesの既存リポジトリで `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js`, `README.md` を上書きしてください。`icons` は変更不要です。


## v5.0.3 20/20監査での最終修正
- `FormUI` に TextField / NumberField / DateField / TimeField / SelectField / MoneyField / SuffixField を共通部品として実装
- margin / padding / gap を4pxグリッドのデザイントークンへ統一
- ボタンなどの操作領域を最低44px × 44pxに統一
- 完全版ZIPに `icons/icon-192.png` と `icons/icon-512.png` を同梱
