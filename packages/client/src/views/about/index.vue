<template>
  <div class="about">
    <img class="logo" src="../../../src-tauri/icons/128x128.png" alt="logo">
    <h1 class="title">Cherry Markdown</h1>
    <p class="desc">一款 Markdown 编辑器，可以在浏览器或服务器中运行</p>
    <a class="link" target="_blank" href="https://github.com/Tencent/cherry-markdown">https://github.com/Tencent/cherry-markdown</a>
    <p class="copyright">Copyright © 1998 - 2025 Tencent. All Rights Reserved.</p>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
  .about {
    padding: 20px 10px;
    text-align: center;
    overflow: hidden;
  }

  .logo{
    width: 60px;
    height: 60px;
    margin-right: -20px;
  }

  .title{
    font-size: 16px;
  }

  .desc{
    font-size: 12px;
    margin: 10px 0;
    color: #666;
  }

  .link{
    color: #007fff;
    font-size: 12px;
    text-decoration: none;
  }

  .copyright{
    margin-top: 20px;
    color: #999;
    font-size: 10px;
  }
</style>
