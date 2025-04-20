<template>
  <div class="setting-container">
    <t-layout>
      <t-aside width="180px" class="setting-aside">
        <!-- <div class="search-box">
          <t-input
            v-model="searchText"
            placeholder="查找..."
            :style="{ width: '100%' }"
            clearable
          >
            <template #prefix-icon>
              <t-icon name="search" />
            </template>
          </t-input>
        </div> -->
        <t-menu
          theme="light"
          value="image"
        >
          <!-- <t-menu-item value="file">
            <template #icon><t-icon name="file" /></template>
            文件
          </t-menu-item>
          <t-menu-item value="editor">
            <template #icon><t-icon name="edit" /></template>
            编辑器
          </t-menu-item> -->
          <t-menu-item value="image">
            <template #icon><t-icon name="image" /></template>
            图像
          </t-menu-item>
          <!-- <t-menu-item value="markdown">
            <template #icon><t-icon name="code" /></template>
            Markdown
          </t-menu-item>
          <t-menu-item value="export">
            <template #icon><t-icon name="download" /></template>
            导出
          </t-menu-item>
          <t-menu-item value="appearance">
            <template #icon><t-icon name="view-module" /></template>
            外观
          </t-menu-item>
          <t-menu-item value="general">
            <template #icon><t-icon name="setting" /></template>
            通用
          </t-menu-item> -->
        </t-menu>
      </t-aside>
      <t-layout>
        <t-content class="setting-content">
          <t-card :bordered="false" :style="{ '--td-card-padding': '8px' }">
            <t-form
              ref="form"
              :data="formData"
              @submit="onSubmit"
              labelWidth="160px"
              :style="{ '--td-form-item-margin-bottom': '4px' }"
            >
              <t-divider>插入图片时...</t-divider>
              <t-form-item>
                <t-select v-model="formData.insertOperation" :style="{ width: '360px' }">
                  <t-option key="none" label="无特殊操作" value="none" />
                  <t-option key="upload" label="上传图片" value="upload" />
                </t-select>
              </t-form-item>
              <t-form-item>
                <t-checkbox v-model="formData.applyLocalRules">对本地位置的图片应用上述规则</t-checkbox>
              </t-form-item>
              <t-form-item>
                <t-checkbox v-model="formData.applyNetworkRules">对网络位置的图片应用上述规则</t-checkbox>
              </t-form-item>
              <t-form-item>
                <t-checkbox v-model="formData.autoUploadByYaml">允许根据 YAML 设置自动上传图片</t-checkbox>
              </t-form-item>

              <t-divider>图片语法偏好</t-divider>
              <t-form-item>
                <t-checkbox v-model="formData.useRelativePath">优先使用相对路径</t-checkbox>
              </t-form-item>
              <t-form-item label="为相对路径添加">
                <t-input v-model="formData.relativePath" placeholder="./" :style="{ width: '360px' }" />
              </t-form-item>
              <t-form-item>
                <t-checkbox v-model="formData.autoConvertUrl">插入时自动转义图片 URL</t-checkbox>
              </t-form-item>

              <t-divider>上传服务设定</t-divider>
              <t-form-item label="上传服务">
                <t-select v-model="formData.uploadService" :style="{ width: '360px' }">
                  <t-option key="none" label="无" value="none" />
                  <t-option key="picgo-core" label="PicGO-Core" value="picgo" />
                </t-select>
              </t-form-item>

              <t-form-item>
                <t-space>
                  <t-button theme="primary" type="submit">保存配置</t-button>
                  <t-button @click="testConnection" v-if="formData.uploadService === 'picgo'">测试连接</t-button>
                </t-space>
              </t-form-item>
            </t-form>
          </t-card>
        </t-content>
      </t-layout>
    </t-layout>
  </div>
</template>

<script lang="ts" setup>
import './index.css'
import { useSettingForm } from './index'

const { form, formData, onSubmit, testConnection } = useSettingForm()
</script>

<style scoped>
</style>