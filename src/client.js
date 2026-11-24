// dsh-settings-launcher — client half.
//
// Two independent switches for the sidebar-foot account entry, set on the
// plugin page:
//
//   hover   the shipped menu opens when the pointer enters the row
//   direct  a click opens the Settings panel instead of the menu
//
// Neither switch replaces anything. The seat `settings.launcher` keeps the
// shipped AccountMenu occupant, so its markup, icons, shortcut row, sign-in
// dialog, sign-out confirmation, "model sign-in required" toasts, the account
// notice stack on `settings.launcher.notifications` and its locale copy all
// stay exactly as shipped. Only two things are attached to the shipped button:
// pointer timers for `hover`, and one capturing click listener for `direct`
// that runs the shipped `settings.open` shortcut command before React's own
// onClick can toggle the menu.
//
// When `direct` is on and `hover` is off, the menu becomes unreachable by mouse
// — so 意见反馈 / 登录·退出登录 are injected into the shipped 账号与余额 page to
// keep them available. With `hover` also on the menu stays reachable and no
// card is injected.
window.__ModuleLoader__.load({
  id: 'dsh-settings-launcher',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /** Effect labels; Cordis names the fiber after these. */
    const NS = 'dsh-settings-launcher'
    /** The questionnaire the shipped account menu opens (its only feedback target). */
    const FEEDBACK_URL =
      'https://trtgsjkv6r.feishu.cn/share/base/form/shrcnlCoGElW7MQznGy9r3YYXcg?hide_uid=1&hide_device_info=1&hide_harness_version=1'

    /**
     * Both switches live in localStorage rather than the Loader Config: the
     * client half switches at runtime, and a Config edit restarts the row
     * instead of reaching the browser. One store, read by the switch card and
     * the installer, so a change lands everywhere at once.
     */
    const STORE_KEY = 'dsh-settings-launcher:flags'
    /**
     * Keys written under the package's previous name. Read once, then removed
     * after the first successful write, so a rename does not silently reset
     * the switches a user already chose.
     */
    const LEGACY_STORE_KEYS = ['dsh-settings-direct:flags']
    /** The single-string key written by the version before `:flags`. */
    const LEGACY_STORE_KEY = 'dsh-settings-direct:mode'
    const FLAG_HOVER = 'hover'
    const FLAG_DIRECT = 'direct'
    const DEFAULT_FLAGS = { hover: true, direct: false }
    /** Row-config key: `<bundle package>#<row id from the bundle patch>`. */
    const ROW_CONFIG_KEY = 'dsh-settings-launcher#settings-launcher'

    /**
     * Two different attribute names on purpose. The stylesheet tag and the
     * injected card block used to share one, and the card cleanup sweeps every
     * node carrying that attribute — so reinstalling deleted the stylesheet
     * together with the cards, leaving the plugin page's form unstyled.
     */
    const STYLE_ATTR = 'data-dsd-style'
    const INJECT_ATTR = 'data-dsd-cards'

    /**
     * The shipped account trigger is the only button in the sidebar carrying
     * `data-signed-out` (`AccountMenu` sets it from the sign-in state). Its
     * class prefix is a CSS-module hash that changes every build, and its
     * `aria-haspopup` is rewritten below when the click opens a dialog — so the
     * selector anchors on that flag alone.
     */
    const TRIGGER_SELECTOR = 'button[data-signed-out]'
    /** Any open menu list; the shipped menu is portal-rendered under the body. */
    const MENU_SELECTOR = '[role="menu"]'
    const OPEN_DELAY = 160
    const CLOSE_DELAY = 260
    /** Shipped shortcut command that opens the Settings panel. */
    const SETTINGS_COMMAND = 'settings.open'

    const flagSubscribers = new Set()

    /** Parse one `{hover,direct}` document; `null` when it is not one. */
    function parseFlags(raw) {
      if (raw === null) return null
      try {
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        return { hover: parsed.hover === true, direct: parsed.direct === true }
      } catch {
        return null
      }
    }

    function readFlags() {
      try {
        const own = parseFlags(localStorage.getItem(STORE_KEY))
        if (own !== null) return own
        // Keys written under the package's previous name keep the user's
        // choice across the rename.
        for (const key of LEGACY_STORE_KEYS) {
          const previous = parseFlags(localStorage.getItem(key))
          if (previous !== null) return previous
        }
        // The single-string value from before `:flags`: 'direct' meant "click
        // opens Settings instead of the menu", 'hover' meant "menu opens on
        // hover".
        const legacy = localStorage.getItem(LEGACY_STORE_KEY)
        if (legacy === 'direct') return { hover: false, direct: true }
        if (legacy === 'hover') return { hover: true, direct: false }
      } catch {
        // Storage may be unavailable; the defaults still apply.
      }
      return { ...DEFAULT_FLAGS }
    }

    function writeFlags(next) {
      const value = { hover: next.hover === true, direct: next.direct === true }
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(value))
        localStorage.removeItem(LEGACY_STORE_KEY)
        // Drop the previous-name copies only after the new key is written.
        for (const key of LEGACY_STORE_KEYS) localStorage.removeItem(key)
      } catch {
        // A failed write leaves the previous flags in effect; report nothing.
      }
      for (const fn of flagSubscribers) {
        try {
          fn(value)
        } catch {
          // A broken subscriber must not stop the others.
        }
      }
    }

    function subscribeFlags(fn) {
      flagSubscribers.add(fn)
      return () => {
        flagSubscribers.delete(fn)
      }
    }

    /** One line for the plugin row and for any log message. */
    function flagsSummary(flags) {
      if (flags.hover && flags.direct) return '当前：悬浮展开菜单 + 点击进设置'
      if (flags.hover) return '当前：悬浮展开菜单'
      if (flags.direct) return '当前：点击进设置'
      return '当前：官方原样（点一下弹菜单）'
    }

    const CSS = [
      '.dsd-inject{display:flex;flex-direction:column;gap:12px;margin-top:12px}',
      '.dsd-card{border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.18));',
      'border-radius:16px;padding:16px 20px;display:flex;flex-direction:column;gap:4px;',
      'background:var(--dsw-alias-bg-primary,transparent);box-sizing:border-box}',
      '.dsd-title{font-size:14px;color:var(--dsw-alias-label-primary)}',
      '.dsd-sub{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      '.dsd-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}',
      '.dsd-btn{font:inherit;font-size:13px;line-height:20px;padding:6px 14px;cursor:pointer;',
      'border-radius:var(--dsw-radius-md,8px);border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.3));',
      'background:transparent;color:var(--dsw-alias-label-primary)}',
      '.dsd-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsd-btn:disabled{opacity:.5;cursor:default}',
      '.dsd-btn[data-tone=danger]{color:var(--dsw-alias-state-error-primary,#e5484d);',
      'border-color:var(--dsw-alias-state-error-primary,#e5484d)}',
      '.dsd-note{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
      // The plugin page's form: two independent rows, each its own checkbox.
      '.dsd-form{display:flex;flex-direction:column;gap:8px}',
      '.dsd-choice{display:flex;flex-direction:column;gap:10px}',
      '.dsd-option{display:flex;align-items:flex-start;gap:10px;cursor:pointer;',
      'border:1px solid var(--dsw-alias-border-secondary,rgba(128,128,128,.18));',
      'border-radius:var(--dsw-radius-md,8px);padding:10px 12px;background:transparent}',
      '.dsd-option[data-selected=true]{border-color:var(--dsw-alias-state-business-primary,#4a6cf7);',
      'background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsd-option input{margin:2px 0 0;flex:none}',
      '.dsd-optionText{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dsd-optionTitle{font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.dsd-optionHint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
    ].join('')

    function ensureStyle() {
      if (typeof document === 'undefined') return null
      const existing = document.querySelector('style[' + STYLE_ATTR + ']')
      if (existing !== null) {
        if (existing.textContent !== CSS) existing.textContent = CSS
        return existing
      }
      const tag = document.createElement('style')
      tag.setAttribute(STYLE_ATTR, '1')
      tag.textContent = CSS
      document.head.appendChild(tag)
      return tag
    }

    /**
     * The switch on the plugin page. The host hands a keyed
     * `plugins.row.config` occupant either `view: 'summary'` (the one-liner
     * under the row) or `view: 'page'` (this form). There is no save button: a
     * checkbox change is the whole edit, so the choice lands immediately and
     * the installer below re-runs.
     */
    function SwitchCard(props) {
      const [, forceRender] = React.useReducer((count) => count + 1, 0)
      const [flags, setFlags] = React.useState(readFlags)
      React.useEffect(() => subscribeFlags((next) => { setFlags(next); forceRender() }), [])

      if (props?.view === 'summary') {
        return h('span', { className: 'dsd-note' }, flagsSummary(flags))
      }

      const row = (key, title, hint) =>
        h(
          'label',
          { key, className: 'dsd-option', 'data-selected': flags[key] === true ? 'true' : undefined },
          h('input', {
            type: 'checkbox',
            checked: flags[key] === true,
            onChange: (event) => writeFlags({ ...flags, [key]: event.target.checked === true }),
          }),
          h(
            'span',
            { className: 'dsd-optionText' },
            h('span', { className: 'dsd-optionTitle' }, title),
            h('span', { className: 'dsd-optionHint' }, hint),
          ),
        )

      return h(
        'div',
        { className: 'dsd-form' },
        h(
          'fieldset',
          { className: 'dsd-choice', 'aria-label': '侧栏账号入口的交互' },
          row(
            FLAG_HOVER,
            '悬浮展开菜单',
            '指针移入即展开原版菜单（设置 / 意见反馈 / 退出登录），移出收起；点击可固定。',
          ),
          row(
            FLAG_DIRECT,
            '点击进设置',
            '点击直达设置面板；「账号与余额」页同时追加意见反馈与登录/退出登录两张卡片（与菜单内容重复，属预期）。',
          ),
          h('span', { className: 'dsd-note' }, flagsSummary(flags)),
        ),
      )
    }

    /**
     * Resolve the account Remote surface. `remote.account` is the same service
     * path the account plugin injects; the nested form is the fallback for a
     * deployment that only publishes the namespace root.
     */
    function accountService(ctx) {
      for (const key of ['remote.account', 'remote']) {
        try {
          const service = ctx?.get(key)
          if (key === 'remote') {
            if (service?.account !== undefined) return service.account
          } else if (service !== undefined && service !== null) {
            return service
          }
        } catch {
          // A missing service is a fallback, not a failure.
        }
      }
      return null
    }

    /** Metadata the account Remote methods carry. */
    function clientMeta(ctx) {
      const locale = (() => {
        try {
          return ctx.get('locale')?.getSnapshot()?.active ?? 'zh'
        } catch {
          return 'zh'
        }
      })()
      return {
        version: '0.3.0',
        locale,
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      }
    }

    /**
     * The actions the menu holds, appended to the shipped "账号与余额" page for
     * the click-only combination.
     *
     * That page is owned by ui-settings-account and declares no extension slot,
     * so the only way in is the DOM: when the settings dialog is open and the
     * account row is the active section, a card block is appended to the section
     * column and removed again on any other section. Everything here is written
     * in plain DOM — React never owns these nodes, so the observer re-adds them
     * whenever the shell re-renders the column.
     */
    /** Active-section text that means "the account page". */
    const ACCOUNT_LABELS = ['账号与余额', 'Account & balance', 'Account']

    function buildInjectedCards(ctx) {
      const root = document.createElement('div')
      root.setAttribute(INJECT_ATTR, '1')
      root.className = 'dsd-inject'

      const accountCard = document.createElement('section')
      accountCard.className = 'dsd-card'
      const accountTitle = document.createElement('div')
      accountTitle.className = 'dsd-title'
      accountTitle.textContent = '账号'
      const accountSub = document.createElement('div')
      accountSub.className = 'dsd-sub'
      accountSub.textContent = '正在读取账号状态…'
      const accountActions = document.createElement('div')
      accountActions.className = 'dsd-actions'
      accountCard.append(accountTitle, accountSub, accountActions)

      const feedbackCard = document.createElement('section')
      feedbackCard.className = 'dsd-card'
      const feedbackTitle = document.createElement('div')
      feedbackTitle.className = 'dsd-title'
      feedbackTitle.textContent = '意见反馈'
      const feedbackSub = document.createElement('div')
      feedbackSub.className = 'dsd-sub'
      feedbackSub.textContent = '在浏览器中打开问卷，提交问题或建议。'
      const feedbackActions = document.createElement('div')
      feedbackActions.className = 'dsd-actions'
      const feedbackButton = document.createElement('button')
      feedbackButton.type = 'button'
      feedbackButton.className = 'dsd-btn'
      feedbackButton.textContent = '打开问卷'
      feedbackButton.addEventListener('click', () => {
        window.open(FEEDBACK_URL, '_blank', 'noopener')
      })
      feedbackActions.append(feedbackButton)
      feedbackCard.append(feedbackTitle, feedbackSub, feedbackActions)

      root.append(accountCard, feedbackCard)

      const service = accountService(ctx)

      /**
       * One action button whose listeners are rebuilt whenever the account state
       * changes. Replacing the node keeps the old listeners from stacking up;
       * `actionButton` always points at the node currently in the DOM.
       */
      let actionButton = null
      let busy = false

      const setBusy = (value, text) => {
        busy = value
        if (actionButton === null) return
        actionButton.disabled = value
        if (value) actionButton.textContent = text
      }

      async function onSignOut() {
        if (service === null || busy || actionButton === null) return
        const node = actionButton
        if (node.dataset.confirm !== '1') {
          node.dataset.confirm = '1'
          node.textContent = '确认退出'
          accountSub.textContent = '再点一次「确认退出」完成退出。'
          setTimeout(() => {
            if (node.dataset.confirm === '1') {
              node.dataset.confirm = ''
              paint('signed-in')
            }
          }, 5000)
          return
        }
        node.dataset.confirm = ''
        setBusy(true, '正在退出…')
        try {
          const result = await service.signOut(clientMeta(ctx))
          if (!result?.ok) throw new Error('sign out failed')
          paint('signed-out')
        } catch {
          accountSub.textContent = '退出登录失败，请稍后再试。'
          paint('signed-in')
        }
      }

      async function onSignIn() {
        if (service === null || busy || actionButton === null) return
        setBusy(true, '正在登录…')
        try {
          const result = await service.startSignIn(clientMeta(ctx))
          if (!result?.ok) throw new Error('sign in failed')
          const url = result.value?.attempt?.authorizeUrl
          if (typeof url === 'string' && url !== '') window.open(url, '_blank', 'noopener')
          accountSub.textContent = '已在浏览器中打开登录页，完成后回到这里即可。'
          paint('signed-out')
        } catch {
          accountSub.textContent = '无法开始登录，请稍后再试。'
          paint('signed-out')
        }
      }

      /** `status` is 'signed-in', 'signed-out', 'unavailable' or 'unknown'. */
      const paint = (status) => {
        busy = false
        if (status === 'signed-in') accountSub.textContent = '退出后不影响任何本地数据，可随时重新登录。'
        else if (status === 'signed-out') accountSub.textContent = '未登录。'
        else accountSub.textContent = '当前环境无法读取账号服务。'

        const replacement = document.createElement('button')
        replacement.type = 'button'
        replacement.className = 'dsd-btn'
        if (status === 'signed-in') {
          replacement.textContent = '退出登录'
          replacement.addEventListener('click', () => { void onSignOut() })
        } else {
          replacement.textContent = '登录'
          if (status === 'signed-out') {
            replacement.addEventListener('click', () => { void onSignIn() })
          } else {
            replacement.disabled = true
          }
        }
        if (actionButton === null) {
          actionButton = replacement
          accountActions.append(actionButton)
          return
        }
        actionButton.replaceWith(replacement)
        actionButton = replacement
      }

      paint('unknown')
      if (service !== null) {
        Promise.resolve()
          .then(() => service.getState())
          .then((result) => {
            if (!result?.ok) return paint('unknown')
            paint(result.value?.status === 'credential-stored' ? 'signed-in' : 'signed-out')
          })
          .catch(() => paint('unknown'))
      } else {
        paint('unavailable')
      }

      return root
    }

    /**
     * Keep the injected block in step with the open dialog: the shell swaps the
     * section column on every navigation, so the block is re-added on the account
     * row and dropped everywhere else.
     */
    function installAccountCardInjector(ctx) {
      if (typeof document === 'undefined') return () => {}
      let dialog = null
      let dialogObserver = null
      let scheduled = false

      const findDialog = () =>
        document.querySelector('[role="dialog"][data-shortcut-modal="settings"]')

      /**
       * The selected row's label. The shell marks it with `aria-current` in some
       * builds and with a CSS-module `_active` class in others (the local class
       * suffix is stable across builds; the hashed prefix is not), so both are
       * accepted rather than assuming one.
       */
      const currentLabel = (node) => {
        const active =
          node.querySelector('nav button[aria-current="true"]') ??
          node.querySelector('nav button[class*="_active"]')
        return active === null ? null : (active.textContent ?? '').trim()
      }

      const sync = () => {
        scheduled = false
        const next = findDialog()
        if (next === null) {
          if (dialogObserver !== null) {
            dialogObserver.disconnect()
            dialogObserver = null
          }
          dialog = null
          return
        }
        if (next !== dialog) {
          if (dialogObserver !== null) dialogObserver.disconnect()
          dialog = next
          dialogObserver = new MutationObserver(schedule)
          dialogObserver.observe(next, {
            childList: true,
            subtree: true,
            attributes: true,
            // The active row is marked by `aria-current` in some builds and by a
            // class swap in others, so both attribute changes must re-run `sync`.
            attributeFilter: ['aria-current', 'class'],
          })
        }
        const column = dialog.querySelector('[class*="_options"]')
        if (column === null) return
        const label = currentLabel(dialog)
        const wanted = label !== null && ACCOUNT_LABELS.some((one) => label.includes(one))
        const existing = column.querySelector('[' + INJECT_ATTR + ']')
        if (!wanted) {
          if (existing !== null) existing.remove()
          return
        }
        if (existing !== null) return
        column.append(buildInjectedCards(ctx))
      }

      function schedule() {
        if (scheduled) return
        scheduled = true
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(sync)
        else setTimeout(sync, 16)
      }

      const bodyObserver = new MutationObserver((records) => {
        for (const record of records) {
          if (record.addedNodes.length > 0 || record.removedNodes.length > 0) {
            schedule()
            return
          }
        }
      })
      bodyObserver.observe(document.body, { childList: true })
      schedule()

      return () => {
        bodyObserver.disconnect()
        if (dialogObserver !== null) dialogObserver.disconnect()
        for (const node of document.querySelectorAll('[' + INJECT_ATTR + ']')) node.remove()
      }
    }

    /**
     * Build a caller for the shipped `settings.open` command.
     *
     * Nothing in the launcher seat hands out `openSettings` to a bystander, so
     * the panel is opened through the same command its own shortcut uses. The
     * service exposes `register` / `edit` / `describeBinding` but not a runner;
     * `registry` is its own plain field and `registry.invoke(id, context)` is
     * how a menu row runs a command. That shape is checked here rather than
     * assumed, and a deployment without it leaves the shipped click alone.
     */
    function settingsInvoker(ctx) {
      let service = null
      try {
        service = ctx?.get('shortcuts') ?? null
      } catch {
        service = null
      }
      if (service === null) return null
      const registry = service.registry
      if (registry === null || typeof registry !== 'object') return null
      if (typeof registry.invoke !== 'function') return null
      return () => {
        // `settings.open` is not registered by the package itself: the settings
        // shell registers it inside `remoteAccess.whenAccess('settings/describe',
        // ...)`, which resolves asynchronously after activation. Checking
        // `commands.has()` at install time therefore reports "missing" on a
        // perfectly good build, so the check belongs here, per click.
        const commands = registry.commands
        if (typeof commands?.has === 'function' && commands.has(SETTINGS_COMMAND) === false) {
          return false
        }
        // `modal: null` means "no modal is covering the page"; the command
        // opens the panel. Passing `settings` there would close it instead.
        registry.invoke(SETTINGS_COMMAND, { region: 'page', modal: null })
        return true
      }
    }

    /**
     * Attach the two behaviours to the shipped account trigger.
     *
     * Nothing is rendered and no slot is taken, so the menu keeps every bit of
     * its shipped appearance, keyboard behaviour, toasts, dialogs and its
     * `settings.launcher.notifications` stack.
     *
     *   hover   pointer enters the row  -> click it once, if it is not open yet
     *           pointer leaves the row  -> click it again after a delay, unless
     *                                      the pointer moved into the open menu
     *           a real click            -> that menu is pinned
     *   direct  a click lowers the menu if hover had raised it, then opens the
     *           Settings panel
     */
    function installInteraction(ctx, flags) {
      if (typeof document === 'undefined') return () => {}

      const timers = { open: null, close: null }
      let trigger = null
      let menu = null
      /** True while our own synthetic click is running, so it is not "a click". */
      let synthetic = false
      /** A menu the user opened by clicking stays open until dismissed. */
      let pinned = false
      const openSettings = flags.direct ? settingsInvoker(ctx) : null

      if (flags.direct && openSettings === null) {
        console.warn(
          '[dsh-settings-launcher] 拿不到 shortcuts 服务的 registry.invoke，' +
            '「点击进设置」这次不生效，账号入口保持官方行为。',
        )
      }

      const clear = (name) => {
        if (timers[name] !== null) {
          clearTimeout(timers[name])
          timers[name] = null
        }
      }

      const isOpen = () => trigger !== null && trigger.getAttribute('aria-expanded') === 'true'

      const openMenu = () => {
        if (trigger === null || isOpen()) return
        synthetic = true
        try {
          trigger.click()
        } finally {
          synthetic = false
        }
      }

      const closeMenu = () => {
        if (trigger === null || !isOpen()) return
        synthetic = true
        try {
          trigger.click()
        } finally {
          synthetic = false
        }
      }

      /** The portal the trigger raises, so hovering it counts as "inside". */
      const adoptMenu = (before) => {
        const candidates = Array.from(document.querySelectorAll(MENU_SELECTOR))
        const next = candidates.find((node) => !before.has(node)) ?? null
        if (next === menu) return
        releaseMenu()
        menu = next
        if (menu !== null) {
          menu.addEventListener('pointerenter', onMenuEnter)
          menu.addEventListener('pointerleave', onMenuLeave)
        }
      }

      function releaseMenu() {
        if (menu === null) return
        menu.removeEventListener('pointerenter', onMenuEnter)
        menu.removeEventListener('pointerleave', onMenuLeave)
        menu = null
      }

      const pointerInsideMenu = () => {
        if (menu === null || !menu.isConnected) return false
        return menu.matches(':hover') || menu.contains(document.activeElement)
      }

      const scheduleOpen = () => {
        clear('close')
        if (isOpen()) return
        clear('open')
        timers.open = setTimeout(() => {
          timers.open = null
          if (pinned) return
          const before = new Set(document.querySelectorAll(MENU_SELECTOR))
          openMenu()
          // The menu mounts after the click; adopt it once React has committed.
          setTimeout(() => adoptMenu(before), 0)
        }, OPEN_DELAY)
      }

      const scheduleClose = () => {
        clear('open')
        clear('close')
        if (pinned) return
        timers.close = setTimeout(() => {
          timers.close = null
          if (pointerInsideMenu()) return
          closeMenu()
          releaseMenu()
        }, CLOSE_DELAY)
      }

      function onMenuEnter() {
        clear('close')
      }

      function onMenuLeave() {
        scheduleClose()
      }

      function onEnter() {
        scheduleOpen()
      }

      function onLeave() {
        scheduleClose()
      }

      /**
       * A real click is the shipped toggle. Pin only when that click *opened*
       * the menu, and read the result after React has committed the new
       * `aria-expanded` rather than guessing it here.
       */
      function onClick() {
        if (synthetic) return
        clear('open')
        clear('close')
        const before = isOpen()
        setTimeout(() => {
          if (isOpen() && !before) {
            pinned = true
            return
          }
          pinned = false
          releaseMenu()
        }, 0)
      }

      /**
       * `direct`: run the settings command instead of React's menu toggle.
       *
       * Capturing on the trigger and stopping propagation keeps React's
       * delegated onClick (attached at the root, bubble phase) from ever seeing
       * the event. Our own bubble-phase `onClick` sits on this same node, so it
       * needs `stopImmediatePropagation` too. Because `hover` raises the menu on
       * pointer-enter, a click normally arrives with the menu already open; that
       * click lowers the menu and then opens Settings, so both switches can be
       * on at once. `pinned` therefore only applies to the hover-only mode.
       */
      function onClickCapture(event) {
        if (openSettings === null || synthetic) return
        // The command may not be registered yet; when it is not, leave the
        // event alone so the shipped toggle still runs instead of swallowing it.
        if (openSettings() === false) return

        event.preventDefault()
        event.stopPropagation()
        // Our own bubble-phase listener sits on this same node and would still
        // run after stopPropagation, so stop it as well.
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
        clear('open')
        clear('close')
        pinned = false
        // With `hover` on, the pointer entering the row already raised the menu,
        // so a click usually arrives while it is open. Lower it first, then open
        // Settings — otherwise the two switches together would only be able to
        // close the menu and Settings would stay unreachable by mouse.
        if (isOpen()) {
          closeMenu()
          releaseMenu()
        }
      }

      /** Pin release: outside pointerdown, Escape, or the menu closing itself. */
      function onDocumentPointerDown(event) {
        if (!pinned) return
        if (trigger !== null && trigger.contains(event.target)) return
        if (menu !== null && menu.contains(event.target)) return
        pinned = false
      }

      function onDocumentKeyDown(event) {
        if (event.key === 'Escape' && pinned) pinned = false
      }

      /**
       * Announce the real behaviour. With `direct` alone the menu cannot be
       * opened at all, so keeping `aria-haspopup="menu"` would promise a menu
       * that never appears; with `hover` on as well the menu is still reachable
       * and the shipped value stays right.
       */
      const applyAria = (node) => {
        if (node === null) return
        if (flags.direct && !flags.hover) node.setAttribute('aria-haspopup', 'dialog')
      }

      const restoreAria = (node) => {
        if (node === null) return
        if (flags.direct && !flags.hover) node.setAttribute('aria-haspopup', 'menu')
      }

      const bind = () => {
        const next = document.querySelector(TRIGGER_SELECTOR)
        if (next === trigger) return
        if (trigger !== null) {
          trigger.removeEventListener('pointerenter', onEnter)
          trigger.removeEventListener('pointerleave', onLeave)
          trigger.removeEventListener('click', onClick)
          trigger.removeEventListener('click', onClickCapture, true)
          restoreAria(trigger)
        }
        trigger = next
        pinned = false
        releaseMenu()
        if (trigger === null) return
        if (flags.hover) {
          trigger.addEventListener('pointerenter', onEnter)
          trigger.addEventListener('pointerleave', onLeave)
          trigger.addEventListener('click', onClick)
        }
        if (openSettings !== null) trigger.addEventListener('click', onClickCapture, true)
        applyAria(trigger)
      }

      const observer = new MutationObserver(() => {
        bind()
        // The menu unmounts on close; drop the reference so a reopen re-adopts.
        if (menu !== null && !isOpen()) releaseMenu()
      })
      observer.observe(document.body, { childList: true, subtree: true })
      bind()

      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      document.addEventListener('keydown', onDocumentKeyDown, true)

      return () => {
        clear('open')
        clear('close')
        observer.disconnect()
        document.removeEventListener('pointerdown', onDocumentPointerDown, true)
        document.removeEventListener('keydown', onDocumentKeyDown, true)
        if (trigger !== null) {
          trigger.removeEventListener('pointerenter', onEnter)
          trigger.removeEventListener('pointerleave', onLeave)
          trigger.removeEventListener('click', onClick)
          trigger.removeEventListener('click', onClickCapture, true)
          restoreAria(trigger)
        }
        releaseMenu()
      }
    }

    return {
      inject: ['slots', 'remote.account'],
      // The switches are also readable from outside this bundle: the aggregator
      // that vendors this file renders the same card (never a copy) and injects
      // the same stylesheet, so the two surfaces cannot drift.
      __settings: { SwitchCard },
      __ui: { pluginId: NS, css: () => CSS },
      apply(ctx) {
        // ctx.effect 要的是一个 cleanup 函数；ensureStyle() 返回的是 <style>
        // 元素，直接返回会让 Cordis 在激活时拿到非函数值而把 fiber 判为 failed。
        ctx.effect(() => {
          const tag = ensureStyle()
          return () => {
            if (tag !== null) tag.remove()
          }
        }, NS + ': stylesheet')

        // Both switches are read on every install, so a checkbox change tears
        // the running behaviour down and builds the next one without a reload.
        ctx.effect(() => {
          let dispose = null
          const install = () => {
            if (dispose !== null) {
              try {
                dispose()
              } catch {
                // Rebuilding anyway; a failed teardown is not fatal.
              }
              dispose = null
            }
            const flags = readFlags()
            const releases = [installInteraction(ctx, flags)]
            // With `direct` the card is always injected, including when the
            // menu is also reachable through hover. That repeats 意见反馈 and
            // 退出登录 on the account page, which is the intended trade: the
            // page looks the same however the menu was opened.
            if (flags.direct) releases.push(installAccountCardInjector(ctx))
            dispose = () => {
              for (const release of releases) {
                try {
                  release()
                } catch {
                  // One failed cleanup must not skip the others.
                }
              }
            }
          }
          install()
          const off = subscribeFlags(install)
          return () => {
            off()
            if (dispose !== null) {
              try {
                dispose()
              } catch {
                // Nothing left to report on teardown failure.
              }
              dispose = null
            }
          }
        }, NS + ': behaviours')

        // The plugin page's switches; independent of what is running.
        ctx.effect(() => {
          try {
            return ctx.slots.inject('plugins.row.config', () =>
              ctx.slots.register({ name: 'plugins.row.config', key: ROW_CONFIG_KEY }, SwitchCard),
            )
          } catch (error) {
            console.warn('[dsh-settings-launcher] 无法挂载插件页开关：', error)
            return undefined
          }
        }, NS + ': row config')
      },
    }
  },
})
