const subManager = new SubsManager();

Template.boardListHeaderBar.events({
  'click .js-open-archived-board'() {
    Modal.open('archivedBoards');
  },
});

Template.boardListHeaderBar.helpers({
  title(){
    return FlowRouter.getRouteName() == 'home' ? 'my-boards' :'public';
  },
  templatesBoardId() {
    return Meteor.user() && Meteor.user().getTemplatesBoardId();
  },
  templatesBoardSlug() {
    return Meteor.user() && Meteor.user().getTemplatesBoardSlug();
  },
});

BlazeComponent.extendComponent({
  onCreated() {
    Meteor.subscribe('setting');
  },

  boards() {
    let query = {
      archived: false,
      type: 'board',
    }
    if (FlowRouter.getRouteName() == 'home')
      query['members.userId'] = Meteor.userId()
    else
      query.permission = 'public'

    return Boards.find(
      query,
      { sort: ['title'] },
    );
  },
  isStarred() {
    const user = Meteor.user();
    return user && user.hasStarred(this.currentData()._id);
  },
  isAdministrable() {
    const user = Meteor.user();
    return user && user.isBoardAdmin(this.currentData()._id);
  },

  hasOvertimeCards() {
    subManager.subscribe('board', this.currentData()._id, false);
    return this.currentData().hasOvertimeCards();
  },

  hasSpentTimeCards() {
    subManager.subscribe('board', this.currentData()._id, false);
    return this.currentData().hasSpentTimeCards();
  },

  isInvited() {
    const user = Meteor.user();
    return user && user.isInvitedTo(this.currentData()._id);
  },

  events() {
    return [
      {
        'click .js-add-board': Popup.open('createBoard'),
        'click .js-star-board'(evt) {
          const boardId = this.currentData()._id;
          Meteor.user().toggleBoardStar(boardId);
          evt.preventDefault();
        },
        'click .js-clone-board'(evt) {
          Meteor.call(
            'cloneBoard',
            this.currentData()._id,
            Session.get('fromBoard'),
            (err, res) => {
              if (err) {
                this.setError(err.error);
              } else {
                Session.set('fromBoard', null);
                Utils.goBoardId(res);
              }
            },
          );
          evt.preventDefault();
        },
        'click .js-archive-board'(evt) {
          const boardId = this.currentData()._id;
          Meteor.call('archiveBoard', boardId);
          evt.preventDefault();
        },
        'click .js-accept-invite'() {
          const boardId = this.currentData()._id;
          Meteor.call('acceptInvite', boardId);
        },
        'click .js-decline-invite'() {
          const boardId = this.currentData()._id;
          Meteor.call('quitBoard', boardId, (err, ret) => {
            if (!err && ret) {
              Meteor.call('acceptInvite', boardId);
              FlowRouter.go('home');
            }
          });
        },
      },
    ];
  },
}).register('boardList');
