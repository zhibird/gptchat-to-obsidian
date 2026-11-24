# Formula to Note

**简体中文** · [English](README.en.md)

**[安装 Obsidian 插件](#obsidian-插件)**　·　[官方插件页](https://community.obsidian.md/plugins/formula-to-note)　·　[在线使用](https://zhibird.github.io/gptchat-to-obsidian/)　·　[下载离线网页](https://github.com/zhibird/gptchat-to-obsidian/releases/latest/download/gptchat-to-obsidian.html)

把含公式、符号表、图片和参考链接的 ChatGPT 回复整理成 Obsidian 笔记。可以直接粘贴到装有插件的编辑器，也可以先在网页版预览，再复制全文。

## Installation

Formula to Note converts LaTeX in pasted ChatGPT replies into Markdown that Obsidian can render. It preserves Markdown tables and code blocks, and works with Obsidian 1.5.0 or later.

1. In Obsidian, open **Settings → Community plugins**. If prompted, select **Turn on community plugins**.
2. Select **Browse**, search for **Formula to Note**, and open the result by **zhibird**.
3. Select **Install**, then **Enable**. You can also start from **Add to Obsidian** on the [official plugin page](https://community.obsidian.md/plugins/formula-to-note).

## Usage

Paste a reply containing equations into a note to format it automatically. To convert equations already in a note, select the text or leave the cursor in the note and click **Σ** in the left ribbon. [Full English guide](README.en.md)

## Obsidian 插件实录

把左侧的示例回复粘贴到右侧笔记，`\tau_t` 和 `y_t=m_{t+H}-m_t` 就会自动排版，逐行的符号说明也会恢复成两列表格。后半段的 **Σ** 演示处理的是笔记里原有的分式。表格中的条件概率 `P(A|B)` 留在原单元格，缩进代码中的 `\tau_t` 保留原文。

![Formula to Note 1.4.0 实录。粘贴后自动排版无定界符公式并还原符号表，点击左侧 Σ 转换笔记中的已有公式](docs/formula-to-note-demo.gif)

演示使用 Obsidian 1.15.0 和 Formula to Note 1.4.0。[下载演示版本](https://github.com/zhibird/gptchat-to-obsidian/releases/download/1.4.0/formula-to-note.zip) · [安装说明](#obsidian-插件)

## Obsidian 插件

**Formula to Note（公式转笔记）** 可以直接在笔记编辑器中使用。适用于 Obsidian 1.5.0 及以上版本。

### 在 Obsidian 内安装

1. 打开「设置 → 第三方插件」。如有提示，先选择「开启第三方插件」。
2. 点击「浏览」，搜索 **Formula to Note**，打开作者为 **zhibird** 的结果。
3. 点击「安装」，然后点击「启用」。也可以从[官方插件页](https://community.obsidian.md/plugins/formula-to-note)点击 **Add to Obsidian** 打开安装页面。

### 手动安装

1. 从包含插件的 [GitHub Release](https://github.com/zhibird/gptchat-to-obsidian/releases) 下载 `formula-to-note.zip`，解压到库的 `.obsidian/plugins/`。安装完成后，`.obsidian/plugins/formula-to-note/` 内应直接包含 `main.js` 和 `manifest.json`。从源码构建时，复制 `dist/formula-to-note/` 到相同位置即可。
2. 重新加载 Obsidian，在「设置 → 第三方插件」中启用 **Formula to Note**。

### 使用方法

从聊天回复复制一段推导，在笔记正文中粘贴，插入的就是转换好的内容。

**粘贴时自动转换**默认开启。可以在「设置 → Formula to Note」中关闭或重新开启。

**处理已有笔记**时，点击 Obsidian 最左侧工具栏的 **Σ 转换公式**。有选区时按钮只转换选中的文字，只有光标时转换整篇。阅读视图中点击会在同一标签打开编辑视图并转换整篇。可用编辑器的撤销操作一次撤回。命令面板里的 **转换选区** 也可以单独处理选中的文字。

`\tau_t` 或 `y_t=m_{t+H}-m_t` 这样的无定界符公式会自动加上 `$...$`，在正文和表格中都能渲染。识别依据包括常见 TeX 命令、花括号包裹的上下标和数字上标。单独的 `a_b`、文件名和普通代码标识符按原文插入。

Markdown 表格中的条件概率、范数和独立公式会留在同一个单元格内。四空格或制表符缩进形成的代码块、围栏代码、行内代码和笔记属性都受保护。粘贴文件、多光标粘贴和 Obsidian 内部复制沿用编辑器的原生行为。插件在本地处理当前操作，不需要账户或网络服务。

## 网页版

**一段推导，只复制一次。** 大公式、正文里的变量和符号解释按原顺序放进同一篇笔记。右侧可以先看清下标、分式和表格，再决定是否复制。浏览器打开即用，公式预览支持离线。

1. 点击上方「在线使用」打开工具。需要离线使用时，下载单文件版并用浏览器打开。
2. 点击「试用示例」查看效果，或把聊天回复粘贴到左栏。公式优先使用回复的复制按钮，带有图片与来源链接的内容也可以框选复制。
3. 在右栏检查公式和表格。切到「Markdown 源码」可以核对原始字符。点击「复制全文」粘贴进 Obsidian，或点击「保存 .md」保存成笔记。

![左侧粘贴 JEPA 推导，右侧查看排版后的公式和符号表](docs/preview.png)

## 转换示例

输入：

```text
预测损失为
\[ \mathcal L_{\mathrm{pred}} = \|\hat z_{t+1}-z_{t+1}\|^2 \]
其中，\(z_{t+1}\) 表示下一时刻的潜在向量。
```

输出：

```markdown
预测损失为
$$
\mathcal L_{\mathrm{pred}} = \|\hat z_{t+1}-z_{t+1}\|^2
$$
其中，$z_{t+1}$ 表示下一时刻的潜在向量。
```

工具也能从带有 LaTeX 源码的网页公式中提取数学表达式，修复部分下标和范数符号的多余转义。对于复制后变成逐行文本的「符号 / 含义」两列表，它会尝试还原表格。

复制同时包含 Prompt、Response A/B 和 Chosen/Rejected 标签的偏好学习示例时，工具会把问题和两份答案排成 Obsidian 提示框。[查看示例](docs/preference-example.md)

## 图片与离线使用

文本转换、公式排版和表格预览均在本机完成。预览远程图片时，浏览器会向图片所在网站请求图片。导出的笔记保留图片网址，显示效果取决于链接是否有效以及网站的访问权限。复制时缺少可用网址的图片或网页绘图，可另存后拖入 Obsidian。

## 与同类插件的实现差异

| 项目 | 转换发生在哪里 | 适用场景 |
| --- | --- | --- |
| Formula to Note | 自动粘贴、侧栏 Σ 按钮、选区命令和独立网页共用转换逻辑 | 识别带明确 TeX 特征的无定界符公式，还原中文符号表，处理单元格里的条件概率和块公式 |
| Math Paste Bridge 1.0.6 | 粘贴时从剪贴板恢复 LaTeX，检查光标周围的 Markdown | 新粘贴的原文即使缺少定界符，也能识别部分 TeX 和代数式，如 `\tau_t` 和 `y_t=m_{t+H}-m_t` |
| Transfer LaTeX from GPT | 命令或侧栏按钮读取当前文件并替换公式定界符 | 对已有笔记执行整篇转换 |

我们和 Math Paste Bridge 都能从带 LaTeX 注解的富文本中提取公式。无定界符公式的识别参考了它的 TeX 语法。Formula to Note 会把带定界符的条件概率和块公式放在原单元格中，也能把逐行的「符号 / 含义」恢复为表格。侧栏 Σ 的位置参考了 Transfer LaTeX from GPT。[Math Paste Bridge 转换范围](https://github.com/hlyang1992/math-paste-bridge/blob/449357f29808f59418cef21ed50c8f8216a00f0d/README.zh-CN.md) · [Transfer LaTeX from GPT 按钮实现](https://github.com/xixia123/obsidian-transfer-latex-from-gpt/blob/4ae70733d602445656fabf65e12c674f8e3d862d/main.ts)

## 开发与发布

使用 Node.js 24 和 npm。`npm ci` 安装开发依赖，`npm test` 运行转换、网页预览、复制及编辑器事件的回归测试。`npm run build` 生成离线网页 `dist/gptchat-to-obsidian.html` 和插件目录 `dist/formula-to-note/`。网页版开发入口 `index.html` 依然可以直接用浏览器打开。

提交转换问题时，可附上脱敏的原文、复制方式和预期 Markdown。成对的[输入和预期结果](test/fixtures)可用作新测试的起点。

发布时同步更新 `manifest.json`、`versions.json` 和 npm 包版本。在 GitHub 上推送与插件版本完全一致的标签（如 `1.5.0`）。测试和构建通过后，Actions 创建包含插件文件、安装压缩包和离线网页的 Release 草稿。首次进入社区目录还需单独提交审核。[Obsidian 插件发布指南](https://docs.obsidian.md/plugins/releasing/submit-plugin)

## 许可证

项目代码采用 MIT 许可证。内附的 markdown-it 14.1.0、MathJax 3.2.2 和改编自 Math Paste Bridge 的 TeX 识别代码附有各自的许可声明。[项目许可证](LICENSE) · [第三方许可全文](THIRD-PARTY-LICENSES.txt)
