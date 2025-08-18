# Node设计结果

共设计了 11 个Node。

## 设计结果 1

# Node详细设计结果

## VideoValidationNode

### 基本信息
- **Node类型**: 起始验证节点
- **目的**: 验证用户输入的本地视频文件是否有效、可访问且格式兼容，为后续处理流程提供基础元数据

### Prep阶段设计
- **描述**: 准备阶段负责读取用户输入的视频路径，检查文件存在性和可读性，并初始化验证所需的工具
- **从shared读取**: video_path, output_config
- **验证逻辑**: 
  - 检查video_path是否为非空字符串
  - 验证路径指向的文件是否存在
  - 验证文件是否具有读权限
  - 验证output_config是否包含必要的输出目录配置
- **准备步骤**: 
  初始化文件系统检查器; 
  加载支持的音视频格式列表; 
  准备FFmpeg命令行工具检测; 
  创建临时目录路径生成器

### Exec阶段设计
- **描述**: 执行阶段使用FFmpeg和文件系统工具对视频文件进行全面验证，提取基础元数据
- **核心逻辑**: 通过FFmpeg probe获取视频详细信息，验证编码格式、时长、分辨率等关键参数是否在支持范围内
- **处理步骤**: 
  执行FFmpeg probe获取视频流信息; 
  解析视频编码格式并检查兼容性; 
  提取基础元数据（时长、分辨率、帧率、码率）; 
  检查音频轨道存在性; 
  计算视频文件SHA-256哈希值; 
  验证临时目录可写性
- **错误处理**: 
  - 文件不存在：返回error_missing_file Action
  - 无读权限：返回error_no_permission Action
  - 格式不支持：返回error_unsupported_format Action
  - FFmpeg执行失败：返回error_ffmpeg_failed Action
  - 临时目录不可写：返回error_no_temp_space Action

### Post阶段设计
- **描述**: 后处理阶段将验证结果和提取的元数据写入shared，并根据验证结果决定流程走向
- **结果处理**: 将验证通过的视频元数据和哈希值封装为标准格式，准备传递给CacheCheckNode
- **更新shared**: video_meta, video_hash
- **Action逻辑**: 
  - 验证全部通过：返回default Action继续流程
  - 任何验证失败：返回对应的error_* Action终止流程
- **可能Actions**: default, error_missing_file, error_no_permission, error_unsupported_format, error_ffmpeg_failed, error_no_temp_space

### 数据访问
- **读取字段**: video_path, output_config
- **写入字段**: video_meta, video_hash

### 重试配置
- **最大重试**: 2次
- **等待时间**: 1秒

---

## 设计结果 2

# Node详细设计结果

## CacheCheckNode

### 基本信息
- **Node类型**: 缓存检查节点
- **目的**: 通过计算视频文件哈希值检查缓存，避免重复处理相同视频内容，提升整体处理效率

### Prep阶段设计
- **描述**: 准备缓存检查所需的所有前置条件，包括验证缓存目录、计算视频文件哈希值、构建缓存键
- **从shared读取**: video_path, video_meta
- **验证逻辑**: 
  - 验证video_path指向的文件存在且可读
  - 验证缓存目录存在且可写
  - 验证视频文件大小与video_meta中的信息匹配
- **准备步骤**: 
  - 初始化缓存管理器实例；
  - 计算视频文件的SHA-256哈希值；
  - 构建基于哈希值的缓存键；
  - 检查缓存目录结构和权限

### Exec阶段设计
- **描述**: 执行实际的缓存查找逻辑，根据哈希值在缓存系统中查找对应的处理结果
- **核心逻辑**: 使用视频文件内容的SHA-256哈希值作为唯一标识符，在本地缓存系统中查找是否已存在该视频的处理结果
- **处理步骤**: 
  - 使用缓存键查询缓存系统；
  - 如果缓存命中，反序列化缓存结果；
  - 验证缓存结果的完整性和格式兼容性；
  - 记录缓存命中状态
- **错误处理**: 
  - 缓存文件损坏：记录警告并视为缓存未命中；
  - 缓存反序列化失败：记录错误并视为缓存未命中；
  - 缓存系统不可用：记录错误并继续流程（视为缓存未命中）

### Post阶段设计
- **描述**: 根据缓存检查结果更新shared状态，并决定后续流程走向
- **结果处理**: 将缓存检查结果写入shared，包括缓存命中状态和缓存数据（如果命中）
- **更新shared**: video_hash, cache_hit, cached_result
- **Action逻辑**: 
  - 如果cache_hit为true，触发"cache_hit" Action直接跳转到ResultFormattingNode；
  - 如果cache_hit为false，触发"cache_miss" Action继续正常处理流程
- **可能Actions**: cache_hit, cache_miss

### 数据访问
- **读取字段**: video_path, video_meta
- **写入字段**: video_hash, cache_hit, cached_result

### 重试配置
- **最大重试**: 2次
- **等待时间**: 1秒

---

## 设计结果 3

# Node详细设计结果

## FrameExtractionNode

### 基本信息
- **Node类型**: BatchNode（计算密集型）
- **目的**: 从本地视频文件中提取关键帧，支持每秒1帧或基于场景切换检测的智能提取，为后续视觉理解提供图像输入

### Prep阶段设计
- **描述**: 准备视频文件和提取参数，创建临时帧存储目录，验证视频可访问性
- **从shared读取**: video_path, video_meta
- **验证逻辑**: 
  - 检查video_path是否存在且可读
  - 验证video_meta中duration>0且fps>0
  - 确认视频包含视频流（has_video=true）
- **准备步骤**: 
  - 创建临时帧存储目录（/tmp/frames/{video_hash}/）
  - 计算目标帧数（duration*fps或基于场景检测）
  - 初始化帧提取器（FFmpeg或OpenCV）
  - 设置提取参数（每秒1帧或场景切换阈值0.3）

### Exec阶段设计
- **描述**: 使用FFmpeg或OpenCV并行提取关键帧，支持GPU加速解码，生成带时间戳的帧文件
- **核心逻辑**: 
  - 根据提取模式选择提取策略
  - 使用多线程并行处理帧解码和保存
  - 为每帧生成精确时间戳（毫秒级）
  - 压缩帧文件为JPEG格式（质量85%）
- **处理步骤**: 
  - 启动FFmpeg子进程读取视频流
  - 按设定间隔提取帧数据
  - 并行保存帧为JPEG文件
  - 生成帧索引文件（JSON格式）
  - 验证所有帧文件完整性
- **错误处理**: 
  - 帧提取失败时重试3次（间隔2秒）
  - 磁盘空间不足时清理旧缓存
  - 视频解码失败时降级到CPU模式
  - 记录错误帧的时间戳和原因

### Post阶段设计
- **描述**: 整理提取的帧文件，生成结构化帧列表，准备传递给VisualDescriptionNode
- **结果处理**: 
  - 统计成功提取的帧数
  - 计算平均提取间隔
  - 验证帧文件可访问性
- **更新shared**: frame_list
- **Action逻辑**: 
  - 如果成功提取帧数>0，返回default Action
  - 如果提取失败，返回error Action
  - 如果提取帧数<10，返回warning Action（提示视频过短）
- **可能Actions**: default, error, warning

### 数据访问
- **读取字段**: video_path, video_meta
- **写入字段**: frame_list

### 重试配置
- **最大重试**: 3次
- **等待时间**: 2秒

---

## 设计结果 4

# Node详细设计结果

## AudioExtractionNode

### 基本信息
- **Node类型**: BatchNode
- **目的**: 从本地视频文件中提取音频轨道并转换为标准WAV格式，为后续的语音识别做准备

### Prep阶段设计
- **描述**: 准备音频提取所需的输入参数和临时目录，验证视频文件是否包含音频轨道
- **从shared读取**: video_path, video_meta, output_config
- **验证逻辑**: 检查video_meta.has_audio是否为true；验证video_path指向的文件存在且可读；确认output_config.out_dir可写
- **准备步骤**: 创建临时音频输出目录；计算输出WAV文件路径；准备ffmpeg命令参数；设置音频提取质量参数（采样率16kHz，单声道，16bit）

### Exec阶段设计
- **描述**: 使用ffmpeg将视频中的音频轨道提取为WAV格式，支持多种音频编码格式的自动识别和转换
- **核心逻辑**: 通过ffmpeg命令行工具提取音频，自动处理不同编码格式（AAC、AC3、MP3等），统一转换为16kHz采样率的单声道WAV格式以优化语音识别效果
- **处理步骤**: 构建ffmpeg命令：ffmpeg -i input_video -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav；执行命令并监控进度；验证输出文件完整性；计算音频时长与视频时长的一致性
- **错误处理**: 如果视频无音频轨道，返回no_audio_action；如果ffmpeg执行失败，捕获错误日志并返回retry_action（最多重试3次）；如果输出文件损坏或时长异常，返回error_action

### Post阶段设计
- **描述**: 将提取的WAV文件路径写入shared，并触发后续音频转录节点
- **结果处理**: 验证WAV文件大小是否合理（>1KB），检查文件头格式是否正确
- **更新shared**: audio_wav_path
- **Action逻辑**: 如果音频提取成功，返回default_action继续流程；如果视频无音频轨道，返回no_audio_action跳过音频处理；如果重试3次后仍失败，返回error_action终止流程
- **可能Actions**: default, no_audio, error, retry

### 数据访问
- **读取字段**: video_path, video_meta, output_config
- **写入字段**: audio_wav_path

### 重试配置
- **最大重试**: 3次
- **等待时间**: 2秒

---

## 设计结果 5

# Node详细设计结果

## AudioTranscriptionNode

### 基本信息
- **Node类型**: BatchNode（计算密集型批处理节点）
- **目的**: 使用Whisper模型将提取的WAV音频文件转录为带时间戳的文本，支持多语言识别和置信度评估

### Prep阶段设计
- **描述**: 准备音频转录所需的所有参数和资源，验证音频文件有效性，配置Whisper模型参数
- **从shared读取**: audio_wav_path, video_meta
- **验证逻辑**: 
  - 验证audio_wav_path存在且为有效WAV文件
  - 检查文件大小不超过2GB（防止内存溢出）
  - 确认video_meta.has_audio为true
  - 验证音频时长与video_meta.duration差异不超过5%
- **准备步骤**: 
  - 加载Whisper模型（base/large根据GPU显存自动选择）
  - 设置语言检测参数（auto-detect或指定语言）
  - 配置批处理参数（batch_size=8, chunk_length=30s）
  - 初始化VAD（语音活动检测）参数
  - 准备临时存储目录用于分块处理

### Exec阶段设计
- **描述**: 执行音频转录的核心处理，包括语音活动检测、分块转录、时间戳校准和置信度计算
- **核心逻辑**: 
  - 使用VAD检测有效语音段落，过滤静音段
  - 将长音频按30秒窗口分块，重叠1秒避免边界丢失
  - 对每个音频块并行执行Whisper转录
  - 合并相邻块结果，校准时间戳
  - 计算每个转录段的置信度分数
- **处理步骤**: 
  - 读取WAV文件并验证采样率（标准化为16kHz）
  - 应用VAD过滤非语音段，生成语音段落列表
  - 对语音段落进行分块处理，生成处理任务队列
  - 使用GPU批处理执行Whisper转录
  - 后处理转录结果：合并重复、修正时间戳、计算置信度
  - 按时间顺序排序所有转录段
- **错误处理**: 
  - 音频文件损坏：返回"INVALID_AUDIO"错误，附带详细错误信息
  - GPU内存不足：自动降级到CPU处理，记录性能警告
  - Whisper模型加载失败：重试3次，失败后回退到较小模型
  - 转录超时（>5分钟）：中断处理，返回部分结果和超时警告

### Post阶段设计
- **描述**: 将转录结果格式化为标准结构，更新shared存储，并决定后续流程走向
- **结果处理**: 
  - 过滤低置信度段（<0.6）并标记为uncertain
  - 合并过短的相邻段（<0.5秒）
  - 生成转录文本的统计信息（总字数、说话人数量估计）
- **更新shared**: transcription_segments
- **Action逻辑**: 
  - 如果转录成功且至少有一个有效段：返回"success"
  - 如果转录为空或全部段置信度<0.5：返回"low_confidence"
  - 如果发生错误：返回对应的错误类型
- **可能Actions**: success, low_confidence, invalid_audio, gpu_error, timeout

### 数据访问
- **读取字段**: audio_wav_path, video_meta
- **写入字段**: transcription_segments

### 重试配置
- **最大重试**: 3次
- **等待时间**: 2秒

---

## 设计结果 6

# Node详细设计结果

## VisualDescriptionNode

### 基本信息
- **Node类型**: BatchNode（计算密集型批处理节点）
- **目的**: 使用本地部署的多模态大语言模型对视频关键帧进行批量视觉描述生成，为后续多模态融合提供结构化视觉信息

### Prep阶段设计
- **描述**: 准备视觉描述生成所需的全部输入数据，验证关键帧文件完整性，配置批处理参数和模型资源
- **从shared读取**: frame_list, video_meta
- **验证逻辑**: 
  - 验证frame_list非空且每个frame_path指向的文件存在且可读
  - 验证视频分辨率在模型支持范围内（最大2048x2048）
  - 检查GPU显存是否充足（预留至少6GB用于批处理）
- **准备步骤**: 
  - 按时间戳排序frame_list确保时序正确；
  - 根据GPU显存计算最优batch_size（默认8，动态调整）；
  - 加载多模态LLM（默认LLaVA-1.5-7B，可配置）；
  - 准备图像预处理管道（resize→normalize→tensor化）；
  - 初始化进度追踪器用于CLI进度条显示

### Exec阶段设计
- **描述**: 并行批处理关键帧，使用多模态LLM生成每张图像的详细描述，包含场景、物体、动作、文字等视觉元素
- **核心逻辑**: 
  采用"分块-批处理-聚合"策略：将关键帧列表按batch_size分块，每块并行推理，结果按原始顺序聚合。使用固定prompt模板确保描述格式一致性，同时计算置信度分数。
- **处理步骤**: 
  - 对每个batch并行执行：图像预处理→模型推理→后处理；
  - 使用标准prompt："Describe this image in detail, focusing on visible objects, actions, text, and scene context. Keep it concise.";
  - 提取模型输出的文本描述和logits-based置信度；
  - 过滤低置信度描述（阈值0.7）并标记需人工review；
  - 将时间戳、文件路径、描述文本、置信度打包为结构化记录；
  - 实时更新处理进度到进度追踪器
- **错误处理**: 
  - 单张图像处理失败时记录错误并继续处理其余图像；
  - 整个batch失败时自动减半batch_size重试（最多3次）；
  - GPU显存不足时自动切换到CPU推理（带警告日志）；
  - 记录所有错误到error_log供后续人工检查

### Post阶段设计
- **描述**: 聚合所有视觉描述结果，进行质量检查和数据格式化，准备传递给下游MultimodalFusionNode
- **结果处理**: 
  - 按时间戳升序排序所有视觉描述；
  - 计算平均置信度和处理耗时统计；
  - 生成处理摘要（总帧数、成功数、失败数、平均置信度）；
  - 对缺失描述的帧插入占位符记录（标记为"description unavailable"）
- **更新shared**: visual_descriptions, processing_stats
- **Action逻辑**: 
  - 如果成功处理帧数≥90%：返回"success"并传递完整结果；
  - 如果50%≤成功处理帧数<90%：返回"partial_success"并附带警告信息；
  - 如果成功处理帧数<50%：返回"failure"并触发重试机制
- **可能Actions**: success, partial_success, failure, retry

### 数据访问
- **读取字段**: frame_list, video_meta
- **写入字段**: visual_descriptions, processing_stats

### 重试配置
- **最大重试**: 3次
- **等待时间**: 2秒（指数退避：2→4→8秒）

---

## 设计结果 7

# Node详细设计结果

## MultimodalFusionNode

### 基本信息
- **Node类型**: 融合型Node
- **目的**: 将视觉描述与音频转录按时间轴精确对齐，构建统一的多模态上下文表示，为后续内容分析提供结构化输入

### Prep阶段设计
- **描述**: 从shared读取视觉描述和转录文本，验证数据完整性和时间戳一致性，准备对齐所需的参数和缓存
- **从shared读取**: visual_descriptions, transcription_segments, video_meta
- **验证逻辑**: 
  - 检查visual_descriptions和transcription_segments是否非空
  - 验证所有时间戳在0到video_meta.duration范围内
  - 确保时间戳按升序排列
  - 检查是否存在重复时间戳
- **准备步骤**: 
  - 解析visual_descriptions为时间戳到描述的映射字典
  - 解析transcription_segments为时间戳到文本的映射字典
  - 计算时间对齐窗口大小（基于视频帧率和平均语音片段长度）
  - 初始化融合结果容器

### Exec阶段设计
- **描述**: 执行精确的时间对齐算法，将视觉和文本信息按时间戳融合，生成统一的多模态上下文
- **核心逻辑**: 
  - 使用滑动窗口算法在时间轴上对齐视觉描述和转录文本
  - 对于每个时间点，查找最近的视觉描述和转录文本
  - 计算时间距离权重，距离越近权重越高
  - 生成融合描述，包含原始文本、视觉描述和组合描述
  - 处理边界情况（如只有视觉或只有音频的时间段）
- **处理步骤**: 
  - 创建时间轴索引（0到duration，步长0.5秒）
  - 对每个时间点，查找最近的视觉描述（±1秒窗口）
  - 对每个时间点，查找重叠的转录文本片段
  - 计算融合权重：w_visual = exp(-|t_visual - t|/σ), w_text = exp(-|t_text - t|/σ)
  - 生成融合片段：combined = f(text, visual, weights)
  - 合并相邻的相似片段（文本相似度>0.8且视觉描述相同）
  - 按时间顺序排序所有融合片段
- **错误处理**: 
  - 如果visual_descriptions为空，仅使用转录文本生成上下文
  - 如果transcription_segments为空，仅使用视觉描述生成上下文
  - 如果时间戳异常，使用线性插值修复
  - 记录融合过程中的警告信息（如对齐失败的时间段）

### Post阶段设计
- **描述**: 将融合后的多模态上下文对象写入shared，并决定下一步Action
- **结果处理**: 
  - 验证融合结果包含至少一个有效片段
  - 计算融合质量指标（平均对齐误差、覆盖率）
  - 将结果序列化为标准格式
- **更新shared**: multimodal_context
- **Action逻辑**: 
  - 如果融合成功且包含有效内容，返回"continue"
  - 如果融合结果为空，返回"empty_context"
  - 如果发生严重错误，返回"fusion_error"
- **可能Actions**: continue, empty_context, fusion_error

### 数据访问
- **读取字段**: visual_descriptions, transcription_segments, video_meta
- **写入字段**: multimodal_context

### 重试配置
- **最大重试**: 2次
- **等待时间**: 1秒

---

## 设计结果 8

# Node详细设计结果

## ContentAnalysisNode

### 基本信息
- **Node类型**: BatchNode
- **目的**: 基于融合后的多模态上下文，使用本地LLM执行智能内容分析任务，包括摘要提取、问答、主题分析等，生成结构化分析结果

### Prep阶段设计
- **描述**: 准备多模态上下文和用户任务指令，验证数据完整性，构建LLM调用所需的prompt和参数
- **从shared读取**: multimodal_context, user_task, video_meta
- **验证逻辑**: 
  - 检查multimodal_context是否存在且包含有效segments
  - 验证user_task.type是否在['summary', 'qa', 'topics', 'custom']范围内
  - 确保video_meta.duration > 0
  - 检查segments数量是否超过LLM上下文长度限制（默认8000 tokens）
- **准备步骤**: 
  - 根据user_task.type选择对应的系统prompt模板
  - 计算上下文长度，必要时进行分段处理
  - 准备LLM调用参数（temperature=0.3, max_tokens=2000）
  - 构建任务特定的输入格式

### Exec阶段设计
- **描述**: 使用本地LLM对融合后的多模态上下文进行深度分析，根据用户任务生成结构化输出
- **核心逻辑**: 
  - 根据任务类型调用不同的分析策略
  - 对长视频采用滑动窗口分段处理，保持上下文连贯性
  - 使用JSON模式强制输出结构化结果
  - 并行处理多个分析任务（如同时生成摘要和主题）
- **处理步骤**: 
  - 解析user_task确定分析类型和查询内容
  - 构建包含多模态上下文的prompt
  - 调用本地LLM进行内容分析
  - 解析LLM返回的JSON响应
  - 验证结果结构的完整性
  - 对分段结果进行聚合（如需要）
- **错误处理**: 
  - LLM调用失败时重试3次，指数退避
  - 输出格式不符合预期时进行格式修正
  - 上下文超长时自动分段处理
  - 记录错误日志到shared.error_log

### Post阶段设计
- **描述**: 将LLM分析结果结构化为标准格式，准备传递给下游节点，同时根据结果质量决定是否需要补充分析
- **结果处理**: 
  - 将分析结果转换为标准JSON结构
  - 计算结果置信度分数（基于LLM的logprobs）
  - 添加处理时间戳和元数据
  - 对结果进行去重和排序
- **更新shared**: analysis_result
- **Action逻辑**: 
  - 如果analysis_result包含有效内容且置信度>0.8，返回default
  - 如果结果为空或置信度<0.5，返回retry_analysis
  - 如果上下文超长需要分段，返回segment_analysis
- **可能Actions**: default, retry_analysis, segment_analysis

### 数据访问
- **读取字段**: multimodal_context, user_task, video_meta
- **写入字段**: analysis_result

### 重试配置
- **最大重试**: 3次
- **等待时间**: 2秒

---

## 设计结果 9

# Node详细设计结果

## ResultFormattingNode

### 基本信息
- **Node类型**: 格式化输出Node
- **目的**: 将ContentAnalysisNode生成的原始分析结果或缓存中的结果，按照用户配置的格式（JSON/Markdown）进行结构化整理，生成最终可交付的输出文件，并准备缓存存储所需的数据结构

### Prep阶段设计
- **描述**: 检查shared中是否存在可用的分析结果，根据缓存命中状态决定数据来源，验证输出配置的有效性，准备格式化所需的元数据
- **从shared读取**: cache_hit, cached_result, analysis_result, output_config, video_meta, video_path, user_task
- **验证逻辑**: 
  - 如果cache_hit为true，必须存在cached_result且为有效dict
  - 如果cache_hit为false，必须存在analysis_result且为有效dict
  - output_config必须包含out_dir（str）、format（list[str]）字段
  - format列表中至少包含"json"或"markdown"之一
- **准备步骤**: 
  - 根据cache_hit选择数据源（cached_result或analysis_result）
  - 解析output_config获取输出目录和格式要求
  - 生成输出文件名（基于video_path的basename）
  - 准备时间戳和版本信息

### Exec阶段设计
- **描述**: 执行实际的格式化转换，将原始分析结果转换为标准JSON和Markdown格式，生成文件内容并计算文件路径
- **核心逻辑**: 
  - 统一数据结构：无论数据来源是缓存还是新分析，都转换为标准格式
  - 多格式生成：根据配置同时或分别生成JSON和Markdown
  - 元数据注入：添加处理时间、视频信息、任务类型等上下文
  - 文件路径管理：确保输出目录存在，生成唯一文件名避免冲突
- **处理步骤**: 
  - 创建输出目录（如果不存在）
  - 构建标准结果对象：包含summary、qa_pairs、topics、raw_output、meta
  - 生成JSON格式：使用json.dumps(indent=2, ensure_ascii=False)
  - 生成Markdown格式：构建包含标题、摘要、问答、主题的结构化文档
  - 计算输出文件路径：{out_dir}/{basename}_{timestamp}.{ext}
  - 生成文件内容但不实际写入（留给OutputDeliveryNode）
- **错误处理**: 
  - 如果输出目录创建失败，尝试使用系统临时目录
  - 如果JSON序列化失败，回退到str()表示
  - 如果格式配置无效，默认使用JSON格式
  - 记录所有格式化过程中的警告信息

### Post阶段设计
- **描述**: 将格式化后的结果对象写入shared，准备传递给OutputDeliveryNode和CacheStoreNode，同时根据结果状态决定后续Action
- **结果处理**: 
  - 构建formatted_output对象，包含所有生成的文件路径和元数据
  - 添加处理完成时间戳和版本信息
  - 清理临时数据，保留必要字段
- **更新shared**: formatted_output
- **Action逻辑**: 
  - 如果格式化成功：返回"success" Action
  - 如果格式化部分成功（至少一种格式）：返回"partial_success" Action
  - 如果完全失败：返回"format_error" Action
- **可能Actions**: success, partial_success, format_error

### 数据访问
- **读取字段**: cache_hit, cached_result, analysis_result, output_config, video_meta, video_path, user_task
- **写入字段**: formatted_output

### 重试配置
- **最大重试**: 2次
- **等待时间**: 1秒

---

## 设计结果 10

# Node详细设计结果

## CacheStoreNode

### 基本信息
- **Node类型**: 缓存存储Node
- **目的**: 将处理完成的视频分析结果持久化到本地缓存，以便后续相同视频可直接复用，避免重复计算

### Prep阶段设计
- **描述**: 准备缓存存储所需的所有数据，验证缓存目录和文件完整性，确保缓存写入环境就绪
- **从shared读取**: formatted_output, video_hash, video_path, video_meta
- **验证逻辑**: 
  - 检查formatted_output是否包含有效的json_path和markdown_path
  - 验证video_hash是否为有效的SHA-256格式
  - 确认缓存目录存在且可写
  - 验证视频文件仍然存在且未被修改（通过重新计算哈希对比）
- **准备步骤**: 
  - 构建缓存目录结构（如不存在则创建）
  - 生成缓存元数据（包含处理时间、版本号、原始视频哈希）
  - 准备缓存索引更新数据
  - 创建临时写入锁文件防止并发写入冲突

### Exec阶段设计
- **描述**: 执行实际的缓存写入操作，包括结果文件复制、索引更新和元数据存储
- **核心逻辑**: 原子性缓存写入，确保在写入过程中出现异常时缓存状态保持一致
- **处理步骤**: 
  - 创建以video_hash命名的缓存子目录
  - 复制formatted_output中的结果文件到缓存目录
  - 生成并写入cache_manifest.json（包含所有缓存文件清单和元数据）
  - 更新全局缓存索引文件（添加新条目或更新现有条目）
  - 验证写入完整性（通过文件大小和哈希校验）
  - 清理临时锁文件
- **错误处理**: 
  - 磁盘空间不足：尝试清理过期缓存后重试
  - 文件系统权限错误：记录错误并跳过缓存存储
  - 并发写入冲突：等待并重试（指数退避）
  - 完整性校验失败：删除不完整缓存并重试

### Post阶段设计
- **描述**: 完成缓存存储后的清理和状态更新，确保后续节点能正确识别缓存状态
- **结果处理**: 生成缓存存储确认信息，包括存储路径、文件大小、存储时间戳
- **更新shared**: cache_store_status, cache_path
- **Action逻辑**: 
  - 如果存储成功，返回success并附带缓存信息
  - 如果存储失败但非关键错误，返回warning并继续流程
  - 如果存储失败且为关键错误，返回error并记录详细错误信息
- **可能Actions**: success, warning, error

### 数据访问
- **读取字段**: formatted_output, video_hash, video_path, video_meta
- **写入字段**: cache_store_status, cache_path

### 重试配置
- **最大重试**: 3次
- **等待时间**: 2秒

---

## 设计结果 11

# Node详细设计结果

## OutputDeliveryNode

### 基本信息
- **Node类型**: 终端输出节点
- **目的**: 将最终格式化的多模态分析结果持久化到本地文件系统，生成结构化输出文件（JSON/Markdown），并可选启动本地查看器供用户交互浏览

### Prep阶段设计
- **描述**: 准备输出环境，验证输出配置合法性，清理历史输出目录，预生成输出文件路径
- **从shared读取**: formatted_output, output_config, video_meta
- **验证逻辑**: 
  - 检查output_config.out_dir是否存在且可写
  - 验证output_config.format至少包含json或markdown之一
  - 确认formatted_output包含必需字段(json_path, markdown_path, meta)
  - 检查磁盘剩余空间是否足够（预估结果大小×2倍安全余量）
- **准备步骤**: 
  - 解析output_config获取输出根目录和格式列表
  - 基于video_meta生成唯一子目录名（video_hash前8位+时间戳）
  - 创建输出目录结构：/out_dir/{sub_dir}/{formats...}
  - 预生成最终文件路径并写入shared.temp_paths
  - 清理同名历史输出（如果存在）

### Exec阶段设计
- **描述**: 执行实际的文件写入操作，生成多种格式的输出文件，创建查看器索引
- **核心逻辑**: 根据output_config指定的格式列表，将formatted_output中的内容序列化为对应格式，同时生成轻量级HTML查看器索引页
- **处理步骤**: 
  - 按格式列表循环处理：JSON→直接dump；Markdown→渲染模板
  - 为每种格式生成带时间戳的备份文件（.bak）
  - 创建manifest.json记录所有输出文件清单和元数据
  - 生成index.html查看器（如果enable_viewer=true）
  - 计算所有输出文件的SHA-256校验和
  - 生成处理完成报告（包含文件大小、生成时间、校验和）
- **错误处理**: 
  - 磁盘写入失败：重试3次，每次间隔1秒，仍失败则抛出DiskWriteError
  - 文件权限不足：尝试chmod 644，失败则记录警告但不中断流程
  - 查看器模板缺失：降级为纯文件输出，记录警告日志

### Post阶段设计
- **描述**: 完成输出后清理临时文件，更新shared记录最终输出状态，根据配置决定是否启动查看器
- **结果处理**: 将实际生成的文件路径、大小、校验和等信息封装为OutputResult对象
- **更新shared**: final_output_paths, output_manifest, viewer_url
- **Action逻辑**: 
  - 如果enable_viewer=true且环境支持GUI→返回launch_viewer
  - 如果enable_viewer=false或headless环境→返回print_summary
  - 任何错误情况→返回error_report
- **可能Actions**: launch_viewer, print_summary, error_report

### 数据访问
- **读取字段**: formatted_output, output_config, video_meta, video_hash
- **写入字段**: final_output_paths, output_manifest, viewer_url, processing_complete

### 重试配置
- **最大重试**: 3次
- **等待时间**: 1秒

---