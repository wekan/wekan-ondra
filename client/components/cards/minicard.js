import { Cookies } from 'meteor/ostrio:cookies';
const cookies = new Cookies();
// Template.cards.events({
//   'click .member': Popup.open('cardMember')
// });

BlazeComponent.extendComponent({
  template() {
    return 'minicard';
  },

  events() {
    return [
      {
        'click .js-linked-link'() {
          if (this.data().isLinkedCard()) Utils.goCardId(this.data().linkedId);
          else if (this.data().isLinkedBoard())
            Utils.goBoardId(this.data().linkedId);
        },
      },
      {
        'click .js-toggle-minicard-label-text'() {
          if (cookies.has('hiddenMinicardLabelText')) {
            cookies.remove('hiddenMinicardLabelText'); //true
          } else {
            cookies.set('hiddenMinicardLabelText', 'true'); //true
          }
        },
      },
    ];
  },
}).register('minicard');

Template.minicard.helpers({
  showDesktopDragHandles() {
    currentUser = Meteor.user();
    if (currentUser) {
      return (currentUser.profile || {}).showDesktopDragHandles;
    } else if (cookies.has('showDesktopDragHandles')) {
      return true;
    } else {
      return false;
    }
  },
  hiddenMinicardLabelText() {
    currentUser = Meteor.user();
    if (currentUser) {
      return (currentUser.profile || {}).hiddenMinicardLabelText;
    } else if (cookies.has('hiddenMinicardLabelText')) {
      return true;
    } else {
      return false;
    }
  },
});
