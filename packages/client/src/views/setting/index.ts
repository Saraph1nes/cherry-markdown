import { ref, reactive } from 'vue'
import type { FormInstanceFunctions } from 'tdesign-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'

interface FormData {
  insertOperation: string
  applyLocalRules: boolean
  applyNetworkRules: boolean
  autoUploadByYaml: boolean
  useRelativePath: boolean
  relativePath: string
  autoConvertUrl: boolean
  uploadService: string
  serverUrl: string
  token: string
}

export function useSettingForm() {
  const form = ref<FormInstanceFunctions>()
  const formData = reactive<FormData>({
    insertOperation: 'none',
    applyLocalRules: true,
    applyNetworkRules: false,
    autoUploadByYaml: false,
    useRelativePath: false,
    relativePath: './',
    autoConvertUrl: false,
    uploadService: 'none',
    serverUrl: '',
    token: ''
  })

  const onSubmit = () => {
    // 保存配置的逻辑
    MessagePlugin.success('配置已保存');
  }

  const testConnection = () => {
    // 测试连接的逻辑
    if (formData.uploadService === 'picgo') {
      MessagePlugin.success('连接成功');
    }
  }

  return {
    form,
    formData,
    onSubmit,
    testConnection
  }
} 