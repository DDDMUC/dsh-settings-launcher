# dsh-settings-launcher

给 DeepSeek Harness 侧栏底部那个账号入口（`settings.launcher` 座位）加**两个独立开关**，在插件页勾选，可任意组合：

| 悬浮展开菜单 | 点击进设置 | 实际行为 |
|---|---|---|
| ✗ | ✗ | 官方原样：点一下弹菜单 |
| ✓ | ✗ | 指针移入即展开原版菜单，移出收起；点击可固定 |
| ✗ | ✓ | 点击直达设置面板；菜单点不开，意见反馈与登录/退出登录移进「账号与余额」页 |
| ✓ | ✓ | 移入展开菜单；点击先收起菜单再进设置（设置始终可达）。「账号与余额」页同样有那两张卡，与菜单内容重复 |

勾选立即生效，不用重启。

## 安装

```sh
npm i -g dsh-settings-launcher   # 或作为 profile 依赖安装
```

作为 bundle 装进某个 profile：

```sh
dsh plugin --profile <name> install dsh-settings-launcher
```

或者直接给 `plugin_manager install_bundle` 传 npm tgz 的 https URL。

插件页里搜「设置入口」即可找到；两个开关都在它自己的配置卡里。

## 做法：什么都不替换

座位 `settings.launcher` 始终由官方的 `AccountMenu` 占着。所以下面这些全部保持原样，一行都不用重建：

- 菜单的 DOM、图标、`⌥⌘,` 快捷键行、菜单宽度与行高
- 登录弹窗（含桌面端 deviceInfo 回跳）、退出前查运行任务的三种确认文案
- 「模型需登录」「会话已过期」两个 Toast
- `settings.launcher.notifications` 上的账号公告栈
- 全部菜单文案的 i18n

插件只往官方那个按钮上挂两样东西：

**悬浮** — 指针事件驱动官方按钮自己的 toggle：

```
pointerenter → 160ms 后 click() 一次（防手滑误开）
pointerleave → 260ms 后若仍展开再 click() 一次（留出移进菜单的时间）
用户自己点过 → 固定，移出不再关；点外部或按 Esc 才释放
```

菜单是 portal，所以菜单体自己接管指针进入/离开，不会被「从按钮移进菜单」误关。我们自己发的合成点击有标记，不会被当成用户点击而误固定。

**点击进设置** — 一个 capture 阶段监听：

```
点击 → preventDefault + stopPropagation（外加 stopImmediatePropagation）
      → 菜单若开着先 click() 收起它
      → 跑 settings.open 命令打开设置
```

用 capture + `stopPropagation` 是为了让 React 挂在根节点的委托 onClick 根本收不到这个事件；`stopImmediatePropagation` 是用来压住本插件自己挂在同一个按钮上的冒泡期 `onClick`（`stopPropagation` 不会阻止同节点的其它监听器）。

「先收起再进设置」不是多余动作：悬浮开着时，指针移入就已经把菜单拉起来了，点击几乎总是发生在「菜单已开」的状态。若此时交回官方 toggle，就只是把菜单关掉，设置永远点不开 —— 这就是两个都勾选时最初没能实现的原因。

## 为什么走 `settings.open` 命令

座位 owner props 里的 `openSettings` 只发给座位占位者，旁观者拿不到；而官方自己就是用 `ctx.shortcuts.register({ id: 'settings.open', ... })` 打开面板的。服务的公开面只有 `register` / `edit` / `describeBinding`，没有执行入口，但 `registry` 是它自己的字段，`registry.invoke(id, context)` 就是菜单行执行命令的方式。代码里对这个形状逐项检查：`registry` 是对象、`invoke` 是函数，不成立就不装监听、打一条警告、账号入口保持官方行为。

`commands` 里有没有 `settings.open` 是**点击时**才检查的，不是安装时：那条命令由设置 shell 在 `remoteAccess.whenAccess('settings/describe', …)` 里注册，是激活之后异步解析的。安装当时查必然"不存在"，会把好构建误判成不可用（这正是两个都勾选时最初没生效的直接原因）。命令还没就绪时，这次点击原样放行给官方 toggle，不吞事件、不假装成功。

## 无障碍

只有「点击进设置」勾了、而「悬浮」没勾时，菜单才真的点不开。那种组合下把 `aria-haspopup` 从 `menu` 改成 `dialog`，免得读屏软件承诺一个永远不出现的菜单；其余三种组合保留官方值。禁用或卸载时改回 `menu`。

## 「账号与余额」页的卡片什么时候出现

只要勾了「点击进设置」就注入，不论「悬浮」是否也勾着。两个都勾时页面上会出现和菜单重复的两项（意见反馈、退出登录），但页面长相因此在四种组合里保持一致。

## 依赖的官方契约

- `button[data-signed-out]` — 官方的 `AccountMenu` 用它标记登录态，是侧栏里唯一带这个属性的按钮（`aria-haspopup` 会被本插件改写，所以不能拿它当锚点）
- `[role="menu"]` — 官方菜单的 portal 容器
- `aria-expanded` — 官方按钮的展开态
- `settings.open` 命令 + `shortcuts.registry.invoke`
- 「账号与余额」页：设置弹窗 `[data-shortcut-modal="settings"]` 里的 `[class*="_options"]` 列、当前分区用 `aria-current` 或 `_active` 类标记（两种构建都认）

官方改这些地方，对应的开关会失效：改按钮属性则悬浮/点击都不触发（点击仍能弹菜单），改命令则「点击进设置」不生效并打警告。

## 还原

都不勾选、插件页禁用或卸载本 bundle，侧栏立刻恢复成原来的账号菜单；本插件改过的 `aria-haspopup` 也会被改回 `menu`。

## 存储

`localStorage` 的 `dsh-settings-launcher:flags`（`{"hover":bool,"direct":bool}`）。改名前的 `dsh-settings-direct:flags` 与更早的单字符串 `dsh-settings-direct:mode`（`'hover'` / `'direct'`）都会被自动迁移一次，写进新键后清掉旧键 —— 改包名不会重置已经勾过的组合。

## License

MIT
