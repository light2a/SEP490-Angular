# Model avatar người phỏng vấn

`interviewer.glb` — avatar 3D đọc câu hỏi trong màn phỏng vấn (B2C `practice-session`, B2B `campaign-interview`).

## Nguồn

Tạo bằng **[Avaturn](https://avaturn.me)**, lấy từ bộ avatar mẫu của
[met4citizen/TalkingHead](https://github.com/met4citizen/TalkingHead/tree/main/avatars) (`avaturn.glb`).

## ⚠ License — đọc trước khi thương mại hoá

Avatar này **miễn phí cho mục đích phi thương mại**. Điều khoản của Avaturn: dùng thương mại thì
phải thông báo cho họ và chịu thêm một số điều khoản riêng.

ISAS **có thu tiền thật** (PayOS, credit, hoá đơn). Nên nếu hệ thống chuyển sang vận hành thương mại:

- Liên hệ Avaturn theo điều khoản của họ, **hoặc**
- Tự tạo avatar mới bằng tài khoản của tổ chức (license thuộc về mình), **hoặc**
- Thay bằng model **CC0** — `mpfb.glb` trong cùng repo TalkingHead là public domain, không ràng buộc gì.

Đổi avatar chỉ là thay file này; không phải sửa code, miễn là model mới có đủ blend shape bên dưới.

## Yêu cầu bắt buộc của model thay thế

Đường lip-sync đọc morph target theo tên. Model mới **phải có**:

- **15 viseme chuẩn Oculus**: `viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`,
  `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`,
  `viseme_I`, `viseme_O`, `viseme_U`
- **ARKit**: `jawOpen`, `eyeBlinkLeft`, `eyeBlinkRight`

Thiếu viseme thì avatar **vẫn hiện bình thường, chỉ là miệng đứng im** — không có lỗi nào báo.
Nên kiểm bằng máy trước khi thay, đừng tin mô tả của nhà cung cấp:

```bash
node -e '
const fs=require("fs"),b=fs.readFileSync(process.argv[1]);
const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
const n=new Set();
for(const m of j.meshes||[]){for(const t of m.extras?.targetNames||[])n.add(t);
for(const p of m.primitives||[])for(const t of p.extras?.targetNames||[])n.add(t);}
const v=[...n].filter(x=>x.includes("viseme"));
console.log("viseme:",v.length,v.sort().join(" "));
console.log("ARKit:",["jawOpen","eyeBlinkLeft","eyeBlinkRight"].filter(x=>n.has(x)).join(" "));
' public/avatar/interviewer.glb
```

## Đã nén

Bản gốc 13,8 MB → **6,5 MB**, giữ nguyên **72 morph target** (đã đối chiếu trước/sau, không mất cái nào):

```bash
npx @gltf-transform/cli optimize in.glb out.glb --compress quantize --texture-compress webp
```

Dùng `quantize` (`KHR_mesh_quantization`) chứ **không** Draco: three.js đọc quantize sẵn, còn Draco
đòi host thêm decoder wasm — thêm một đường lỗi mà không đổi lại được bao nhiêu dung lượng.
Phần lớn dung lượng nằm ở **morph target** (72 bộ delta cho ~24k vertex), không phải texture.
