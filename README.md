# 公式转笔记 · GPTChat to Obsidian

**[在线使用](https://zhibird.github.io/gptchat-to-obsidian/)**　·　[下载离线网页](https://github.com/zhibird/gptchat-to-obsidian/releases/latest/download/gptchat-to-obsidian.html)　·　[安装 Obsidian 插件](#obsidian-插件)

把含公式、符号表、图片和参考链接的 ChatGPT 回复整段粘贴进来，在右侧预览后，一次复制到 Obsidian。

**一段推导，只复制一次。** 大公式、正文里的变量和符号解释按原顺序放进同一篇笔记。右侧可以先看清下标、分式和表格，再决定是否复制。浏览器打开即用，公式预览支持离线。

![左侧粘贴 JEPA 推导，右侧查看排版后的公式和符号表](docs/preview.png)

## Obsidian 插件

**Formula to Note（公式转笔记）** 可以直接在笔记编辑器中使用。适用于 Obsidian 1.5.0 及以上版本。

1. 从包含插件的 [GitHub Release](https://github.com/zhibird/gptchat-to-obsidian/releases) 下载 `formula-to-note.zip`，解压到库的 `.obsidian/plugins/`。安装完成后，`.obsidian/plugins/formula-to-note/` 内应直接包含 `main.js` 和 `manifest.json`。从源码构建时，复制 `dist/formula-to-note/` 到相同位置即可。
2. 重新加载 Obsidian，在「设置 → 第三方插件」中启用 **Formula to Note**。
3. 从聊天回复复制一段推导，在笔记正文中粘贴。查看效果后可以用编辑器的撤销操作一次撤回。处理笔记中已有的材料时，选中文本，在命令面板运行 **Formula to Note: Convert selected text to a formula note / 转换选区**。

Markdown 表格中的条件概率、范数和独立公式会留在同一个单元格内。四空格或制表符缩进形成的代码块、围栏代码、行内代码和笔记属性都受保护。粘贴文件、多光标粘贴和 Obsidian 内部复制沿用编辑器的原生行为。插件在本地处理当前操作，不需要账户或网络服务。

## 网页版

1. 点击上方「在线使用」打开工具。需要离线使用时，下载单文件版并用浏览器打开。
2. 点击「试用示例」查看效果，或把聊天回复粘贴到左栏。公式优先使用回复的复制按钮，带有图片与来源链接的内容也可以框选复制。
3. 在右栏检查公式和表格。切到「Markdown 源码」可以核对原始字符。点击「复制全文」粘贴进 Obsidian，或点击「保存 .md」保存成笔记。

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
| Formula to Note | 编辑器粘贴事件、手动选区、独立网页共用转换逻辑 | 整段数学推导，含中文符号表、代码和偏好学习示例 |
| Math Paste Bridge | 粘贴时从剪贴板恢复 LaTeX，并检查光标周围的 Markdown | 高频粘贴，也能识别部分没有定界符的 TeX |
| Transfer LaTeX from GPT | 命令或侧栏按钮读取当前文件并替换公式定界符 | 对已有笔记执行整篇转换 |

自动粘贴参考了 Math Paste Bridge 对编辑上下文的保护，手动命令参考了 Transfer LaTeX from GPT 的入口。这里的命令只替换选区，插件和网页复用同一份表格与代码处理规则。[Math Paste Bridge 粘贴实现](https://github.com/hlyang1992/math-paste-bridge/blob/449357f29808f59418cef21ed50c8f8216a00f0d/src/main.js) · [Transfer LaTeX from GPT 命令实现](https://github.com/xixia123/obsidian-transfer-latex-from-gpt/blob/4ae70733d602445656fabf65e12c674f8e3d862d/main.ts)

## 开发与发布

使用 Node.js 24 和 npm。`npm ci` 安装开发依赖，`npm test` 运行转换、网页预览、复制及编辑器事件的回归测试。`npm run build` 生成离线网页 `dist/gptchat-to-obsidian.html` 和插件目录 `dist/formula-to-note/`。网页版开发入口 `index.html` 依然可以直接用浏览器打开。

提交转换问题时，可附上脱敏的原文、复制方式和预期 Markdown。成对的[输入和预期结果](test/fixtures)可用作新测试的起点。

发布时同步更新 `manifest.json`、`versions.json` 和 npm 包版本。在 GitHub 上推送与插件版本完全一致的标签（如 `1.2.0`）。测试和构建通过后，Actions 创建包含插件文件、安装压缩包和离线网页的 Release 草稿。首次进入社区目录还需单独提交审核。[Obsidian 插件发布指南](https://docs.obsidian.md/plugins/releasing/submit-plugin)

## 许可证

项目代码采用 [MIT 许可证](LICENSE)。内附的 markdown-it 14.1.0 和 MathJax 3.2.2 使用各自的许可证。[第三方许可全文](THIRD-PARTY-LICENSES.txt)
