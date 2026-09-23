import assert from 'node:assert/strict';
import test from 'node:test';
import { nextEntryState } from '../src/renderer/src/components/chat/thread/chatEntryTransition.ts';
const empty = {chatId:'a',hasMessages:false,hasUser:false,loading:false,reduced:false};
test('首条用户消息只触发一次，空发送保持欢迎态，结束后不重播',()=>{
  const initial=nextEntryState(null,empty);
  assert.equal(initial.armed,true);
  assert.equal(nextEntryState(initial,empty).phase,'welcome');
  const sent={...empty,hasMessages:true,hasUser:true};
  const moving=nextEntryState(initial,sent);
  assert.equal(moving.phase,'transition');
  assert.equal(nextEntryState(moving,sent).phase,'transition');
  const final=nextEntryState(moving,{...sent,completed:true});
  assert.equal(final.phase,'chat');
  assert.equal(nextEntryState(final,sent).phase,'chat');
});
test('历史加载、切换会话不播放转场，旧会话完成信号不影响新空态',()=>{
  const history={...empty,hasMessages:true,hasUser:true};
  assert.equal(nextEntryState(null,history).phase,'chat');
  const loading=nextEntryState(null,{...empty,loading:true});
  assert.equal(nextEntryState(loading,history).phase,'chat');
  const moving=nextEntryState(nextEntryState(null,empty),history);
  assert.equal(nextEntryState(moving,{...history,chatId:'b'}).phase,'chat');
  assert.equal(nextEntryState(moving,{...empty,chatId:'b',completed:true}).phase,'welcome');
});
test('减少动态效果直接落定；消息移除或错误状态不重新聚船',()=>{
  const sent={...empty,hasMessages:true,hasUser:true};
  const initial=nextEntryState(null,empty);
  assert.equal(nextEntryState(initial,{...sent,reduced:true}).phase,'chat');
  const moving=nextEntryState(initial,sent);
  assert.equal(nextEntryState(moving,{...sent,reduced:true}).phase,'chat');
  const final=nextEntryState(moving,{...sent,completed:true});
  assert.equal(nextEntryState(final,empty).phase,'chat');
});
