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
    text-align: center;
  }

  .logo{
    width: 90px;
    height: 90px;
  }

  .title{
    font-size: 20px;
  }

  .desc{
    font-size: 14px;
    margin: 10px 0;
  }

  .link{
    color: #007fff;
    font-size: 14px;
    text-decoration: none;
  }

  .copyright{
    margin-top: 50px;
    color: #999;
    font-size: 12px;
  }
</style>
