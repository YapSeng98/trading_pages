# 黄金 + 比特币小组件

手机桌面、锁屏和 Mac 上直接看：网站现在的结论（可以做多 / 做空 / 等 / 观望）、五个周期的方向、会改变结论的两个价位和离现价多远，黄金还有「哪个先到」的历史比例。价格是小组件自己实时取的（黄金：Swissquote 现货买价；比特币：币安）；结论来自网站每 15 分钟更新的 `data/widget.json`，小组件上会写「结论按几点」，超过两小时会标「较旧」。点一下打开对应的页面。

## iPhone（也能放到 Mac 桌面上）

1. App Store 安装免费的 **Scriptable**，打开一次。
2. 在 Scriptable 里点右上角 **+** 新建脚本，粘贴下面三行，点运行一次（它会下载小组件脚本，存成「黄金比特币」）：

   ```js
   const fm = (() => { try { return FileManager.iCloud(); } catch (e) { return FileManager.local(); } })();
   const code = await new Request("https://yapseng98.github.io/trading_pages/widgets/gold-btc-widget.js").loadString();
   fm.writeString(fm.joinPath(fm.documentsDirectory(), "黄金比特币.js"), code); Script.complete();
   ```

   （或者装好 Scriptable 后告诉 Claude，它会从你的 Mac 把脚本直接放进 Scriptable 的 iCloud 文件夹。）
3. 长按桌面 → 左上角 **+** → 找 **Scriptable** → 选大小 → 加到桌面 → 长按小组件 → **编辑小组件** → Script 选「黄金比特币」。
   - 中号 / 大号：黄金和比特币并排。
   - 小号：只看黄金；Parameter 填 `btc` 就只看比特币。
   - 锁屏：同样选 Scriptable，矩形或一行的都可以。
4. **Mac 桌面**：Mac 和 iPhone 用同一个 Apple ID 时，在 Mac 桌面右键 → 编辑小组件 → 选「iPhone」里的 Scriptable，同一个小组件就会出现在 Mac 桌面上。

iPhone 自己决定小组件多久刷新一次（通常 15 到 30 分钟）；想马上更新就点开它。

## Mac 菜单栏（一直在屏幕最上面）

1. 下载免费的 **SwiftBar**（swiftbar.app），拖进「应用程序」，打开。
2. 它问插件文件夹时，选你个人文件夹里的 **SwiftBarPlugins**（里面已经放好了 `gold-btc.5m.py`）。
3. 菜单栏会出现类似 `🥇4,049 等↓  ₿80,749 观望`：「买 / 卖」是有信号，「等↓ / 等↑」是大方向一致、在等小周期，「观望」是不做。点开看价位、离现价多远和比例；每 5 分钟自动更新。

## Android

用能读网址 JSON 的小组件 App（例如 KWGT），数据地址：
`https://yapseng98.github.io/trading_pages/data/widget.json`
（`gold.tag`、`gold.price`、`gold.arrows`、`gold.lines[0]`……比特币是 `btc.…`）。需要的话告诉 Claude 你的手机，它会按步骤设好。

## 注意

- 小组件只是把网站的结论搬到桌面：规则一样（周线、日线、4 小时同向才做），比特币只作观察。
- 「哪个先到」是 2011–2026 年回放里的比例，不是预测。
- 提醒（新信号、HH→LL 结构转向）还是在打开的黄金页里发；小组件不会自己弹通知。
