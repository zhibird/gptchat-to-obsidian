## 3. Preference Learning：从模仿答案转向比较答案

现在我们不给模型唯一标准答案，而是提供：

### 训练数据示例

> [!question] Prompt
> 求解方程 $x^2-5x+6=0$。

> [!success] Response A · Chosen
> 将其分解为 $(x-2)(x-3)=0$，所以 $x=2,3$。

> [!failure] Response B · Rejected
> 所以 $x=1,6$。

监督信号：A 优于 B，而不只是规定模型必须逐字生成 A。

偏好数据可以来自人工比较、AI 评审，也可以由可验证的任务结果构造。
