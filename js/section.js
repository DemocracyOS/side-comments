var _ = require('./vendor/lodash-custom.js');
var Template = require('../templates/section.html');
var CommentTemplate = require('../templates/comment.html');
var mobileCheck = require('./helpers/mobile-check.js');
var timeago = require('timeago');
var confirm = require('confirmation');
var t = require('t');
var trunkata = require('trunkata');
var classes = require('classes');
var closest = require('closest');
var o = require('dom');

/**
 * Creates a new Section object, which is responsible for managing a
 * single comment section.
 * @param {Object} eventPipe The Emitter object used for passing around events.
 * @param {Array} comments   The array of comments for this section. Optional.
 */
function Section( eventPipe, $el, currentUser, comments, options ) {
  this.eventPipe = eventPipe;
  this.$el = $el;
  this.comments = comments ? comments.comments : [];
  this.currentUser = currentUser || null;
  this.clickEventName = mobileCheck() ? 'touchstart' : 'click';
  this.locale = options.locale || options.trans.locale || 'en';
  this.voting = options.voting || false;

  this.id = $el.data('section-id');

  this.$el.on(this.clickEventName, '.side-comment .marker', _.bind(this.markerClick, this));
  this.$el.on(this.clickEventName, '.side-comment .add-comment', _.bind(this.addCommentClick, this));
  this.$el.on(this.clickEventName, '.side-comment .post', _.bind(this.postCommentClick, this));
  this.$el.on(this.clickEventName, '.side-comment .cancel', _.bind(this.cancelCommentClick, this));
  this.$el.on(this.clickEventName, '.side-comment .delete', _.bind(this.deleteCommentClick, this));
  this.$el.on(this.clickEventName, '.side-comment .upvote', _.bind(this.upvoteCommentClick, this));
  this.$el.on(this.clickEventName, '.side-comment .downvote', _.bind(this.downvoteCommentClick, this));
  this.$el.on(this.clickEventName, '.side-comment .read-more', _.bind(this.readmore, this));
  this.render();
}

/**
 * Click callback event on markers.
 * @param  {Object} event The event object.
 */
Section.prototype.markerClick = function( event ) {
  event.preventDefault();
  this.select();
};

/**
 * Callback for the comment button click event.
 * @param {Object} event The event object.
 */
Section.prototype.addCommentClick = function( event ) {
  event.preventDefault();
  if (this.currentUser) {
    this.showCommentForm();
  } else {
    this.eventPipe.emit('addCommentAttempted');
  }
};

/**
 * Show the comment form for this section.
 */
Section.prototype.showCommentForm = function() {
  if (this.comments.length > 0) {
    this.$el.find('.add-comment').addClass('hide');
    this.$el.find('.comment-form').addClass('active');
  }

  this.focusCommentBox();
};

/**
 * Hides the comment form for this section.
 */
Section.prototype.hideCommentForm = function() {
  if (this.comments.length > 0) {
    this.$el.find('.add-comment').removeClass('hide');
    this.$el.find('.comment-form').removeClass('active');
  }

  this.$el.find('.comment-box').empty();
};

/**
 * Focus on the comment box in the comment form.
 */
Section.prototype.focusCommentBox = function() {
  // NOTE: !!HACK!! Using a timeout here because the autofocus causes a weird
  // "jump" in the form. It renders wider than it should be on screens under 768px
  // and then jumps to a smaller size.
  setTimeout(_.bind(function(){
    this.$el.find('.comment-box').get(0).focus();
  }, this), 300);
};

/**
 * Cancel comment callback.
 * @param  {Object} event The event object.
 */
Section.prototype.cancelCommentClick = function( event ) {
  event.preventDefault();
  this.cancelComment();
};

/**
 * Cancel adding of a comment.
 */
Section.prototype.cancelComment = function() {
  if (this.comments.length > 0) {
    this.hideCommentForm();
  } else {
    this.deselect();
    this.eventPipe.emit('hideComments');
  }
};

/**
 * Post comment callback.
 * @param  {Object} event The event object.
 */
Section.prototype.postCommentClick = function( event ) {
  event.preventDefault();
  this.postComment();
};

/**
 * Post a comment to this section.
 */
Section.prototype.postComment = function() {
  var $commentBox = this.$el.find('.comment-box');
  var commentBody = $commentBox.val();
  if (commentBody.length > 4096) {
    return this.$el.find('.comment-form .error').html(t('Argument is limited to 4096 characters'));
  } else {
    this.$el.find('.comment-form .error').html('');
  }
  var comment = {
    sectionId: this.id,
    comment: commentBody,
    authorAvatarUrl: this.currentUser.avatarUrl,
    authorName: this.currentUser.name,
    authorId: this.currentUser.id,
    authorUrl: this.currentUser.authorUrl || null
  };
  $commentBox.val(''); // Clear the comment.
  this.eventPipe.emit('commentPosted', comment);
};

/**
 * Insert a comment into this sections comment list.
 * @param  {Object} comment A comment object.
 */
Section.prototype.insertComment = function( comment ) {
  this.comments.push(comment);
  var newCommentHtml = _.template(CommentTemplate, { 
    comment: comment,
    currentUser: this.currentUser,
    t: t,
    voting: this.voting
  });
  this.$el.find('.comments').append(newCommentHtml);
  this.$el.find('.side-comment').addClass('has-comments');
  this.updateCommentCount();
  this.hideCommentForm();
};

/**
 * Increments the comment count for a given section.
 */
Section.prototype.updateCommentCount = function() {
  this.$el.find('.marker span').text(this.comments.length);
};

/**
 * Event handler for delete comment clicks.
 * @param  {Object} event The event object.
 */
Section.prototype.deleteCommentClick = function( event ) {
  event.preventDefault();
  var commentId = $(event.target).closest('li').data('comment-id');

  function onconfirm(ok) {
    if (ok) return this.deleteComment(commentId);
  }

  confirm(t('side-comments.confirmation.title'), t('side-comments.delete.confirmation'))
  .cancel(t('side-comments.cancel'))
  .ok(t('side-comments.delete'))
  .modal()
  .closable()
  .effect('slide')
  .focus()
  .show(onconfirm.bind(this))
};

/**
 * Finds the comment and emits an event with the comment to be deleted.
 */
Section.prototype.deleteComment = function( commentId ) {
  var comment = _.find(this.comments, { id: commentId });
  comment.sectionId = this.id;
  this.eventPipe.emit('commentDeleted', comment);
};

/**
 * Event handler for upvote comment clicks.
 * @param  {Object} event The event object.
 */
Section.prototype.upvoteCommentClick = function( event ) {
  event.preventDefault();
  var commentId = $(event.target).closest('li').data('comment-id');
  this.upvoteComment(commentId);
};

/**
 * Finds the comment and emits an event with the comment to be upvoted.
 */
Section.prototype.upvoteComment = function( commentId ) {
  var comment = _.find(this.comments, { id: commentId });
  comment.sectionId = this.id;
  this.eventPipe.emit('commentUpvoted', comment);
};

/**
 * Event handler for downvote comment clicks.
 * @param  {Object} event The event object.
 */
Section.prototype.downvoteCommentClick = function( event ) {
  event.preventDefault();
  var commentId = $(event.target).closest('li').data('comment-id');
  this.downvoteComment(commentId);
};

/**
 * Finds the comment and emits an event with the comment to be downvoted.
 */
Section.prototype.downvoteComment = function( commentId ) {
  var comment = _.find(this.comments, { id: commentId });
  comment.sectionId = this.id;
  this.eventPipe.emit('commentDownvoted', comment);
};

/**
 * Removes the comment from the list of comments and the comment array.
 * @param commentId The ID of the comment to be removed from this section.
 */
Section.prototype.removeComment = function( commentId ) {
  this.comments = _.reject(this.comments, { id: commentId });
  this.$el.find('.side-comment .comments li[data-comment-id="'+commentId+'"]').remove();
  this.updateCommentCount();
  if (this.comments.length < 1) {
    this.$el.find('.side-comment').removeClass('has-comments');
  }
};

/**
 * Mark this section as selected. Delsect if this section is already selected.
 */
Section.prototype.select = function() {
  if (this.isSelected()) {
    this.deselect();
    this.eventPipe.emit('sectionDeselected', this);
  } else {
    this.$el.find('.side-comment').addClass('active');

    if (this.comments.length === 0 && this.currentUser) {
      this.focusCommentBox();
    }

    this.$el.find('li[data-comment-id] p.comment').each(function (i, comment) {
      var oldLength = comment.innerHTML.length;
      trunkata(comment, { lines: 4 });
      var newLength = comment.innerHTML.length;
      if (oldLength > newLength) {
        var a = document.createElement('a');
        classes(a).add('action-link').add('read-more');
        a.href = '#';
        a.innerHTML = t('read more');
        comment.appendChild(a);
      }
    });

    this.eventPipe.emit('sectionSelected', this);
  }
};

/**
 * Read full comment
 *
 * @api public
 */

Section.prototype.readmore = function(ev) {
  ev.preventDefault();

  var commentContainer = closest(ev.target,'li[data-comment-id]');
  var id = commentContainer.getAttribute('data-comment-id');
  var comment = get(this.comments, 'id === "%id"'.replace('%id', id));
  var commentText = o('p.comment', commentContainer);

  commentText.html(comment.text);
}

/**
 * Deselect this section.
 */
Section.prototype.deselect = function() {
  this.$el.find('.side-comment').removeClass('active');
  this.hideCommentForm();
};

Section.prototype.isSelected = function() {
  return this.$el.find('.side-comment').hasClass('active');
};

/**
 * Get the class to be used on the side comment section wrapper.
 * @return {String} The class names to use.
 */
Section.prototype.sectionClasses = function() {
  var classes = '';

  if (this.comments.length > 0) {
    classes = classes + ' has-comments';
  }
  if (!this.currentUser) {
    classes = classes + ' no-current-user'
  }

  return classes;
};

/**
 * Render this section into the DOM.
 */
Section.prototype.render = function() {
  this.$el.find('.side-comment').remove();
  var el = $(_.template(Template, {
    commentTemplate: CommentTemplate,
    comments: this.comments,
    sectionClasses: this.sectionClasses(),
    currentUser: this.currentUser,
    t: t,
    voting: this.voting
  }))
  el.appendTo(this.$el);
  timeago('.ago', { lang: this.locale, interval: 10000 });
};

/**
 * Desttroy this Section object. Generally meaning unbind events.
 */
Section.prototype.destroy = function() {
  this.$el.off();
}

module.exports = Section;

function get(list, query) {
  var match;
  var test = new Function('_', 'return _.' + query);

  list.some(function(l) {
    if (test(l)) {
      match = l;
      return true;
    };
    return false;
  });
  return match || null;
}